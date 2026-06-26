import { createHash } from 'node:crypto'

import type {
  MatchSummaryContract,
  TeamPerformanceContract,
  TeamPerformanceReasonContract,
  TeamPerformanceSummaryContract,
} from '../contracts/player.js'
import { isGradeSupportedMode } from '../types/matchesMode.js'
import { normalizeRankTier } from '../utils/rankTier.js'
import { TEAM_PERFORMANCE_RUNTIME_VERSION } from './gradeRuntimeConfig.js'

import { computeMatchPerformanceGrade } from './characterPerformanceGrade/compute.js'
import type { StoredMatchGradeRow } from './characterPerformanceGrade/compute.js'
import {
  lookupBaselineMetricsAtTier,
  lookupCharacterWeaponRole,
} from './characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from './characterPerformanceGrade/tierKey.js'
import {
  RESIDUAL_FALLBACK_LEVELS,
  resolveResidualRoleBaseline,
  TEAM_LUCK_RESIDUAL_BASELINE_VERSION as TEAM_LUCK_RESIDUAL_BASELINE_V2_VERSION,
  TEAM_LUCK_RESIDUAL_WEATHER_THRESHOLDS,
  type ResidualConfidence,
  type ResidualFallbackLevel,
} from './teamLuckResidualBaseline.js'
import {
  computeAdjustedContributionV3,
  TEAM_FLOW_PLACEMENT_EFFECT_VERSION,
  TEAM_LUCK_DIRECT_VERSION,
  teamFlowCenterV3,
  teamFlowWeatherThresholdsV3,
} from './roleScore/roleScoreV3.js'

export const TEAM_PERFORMANCE_BENCHMARK_VERSION = 'fixed-v1'
export const TEAM_PERFORMANCE_METRIC_PRESET_VERSION =
  TEAM_PERFORMANCE_RUNTIME_VERSION === 'v3-direct'
    ? TEAM_LUCK_DIRECT_VERSION
    : 'team-luck-residual.v2'
export const TEAM_LUCK_RESIDUAL_BASELINE_VERSION =
  TEAM_PERFORMANCE_RUNTIME_VERSION === 'v3-direct'
    ? TEAM_FLOW_PLACEMENT_EFFECT_VERSION
    : TEAM_LUCK_RESIDUAL_BASELINE_V2_VERSION
const TEAM_PERFORMANCE_CACHE_LIMIT = 5000

export interface TeamPerformanceParticipantRow {
  gameId: string
  uid?: string | null
  nickname?: string | null
  teamNumber?: number | null
  placement?: number | null
  characterNum: number
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  teamKills?: number | null
  damageToPlayer?: number | null
  rpAfter?: number | null
  bestWeapon?: number | null
  gameDuration?: number | null
  rawJson?: unknown
}

interface ComputeTeamPerformanceParams {
  match: MatchSummaryContract
  ownerUid: string
  ownerNickname?: string | null
  participants: ReadonlyArray<TeamPerformanceParticipantRow>
  displaySeasonId: number
}

interface ParticipantResidual {
  participantKey: string
  residual: number | null
  actualRolePerformanceScore: number | null
  expectedRolePerformanceScore: number | null
  fallbackLevel: ResidualFallbackLevel | null
  sampleCount: number | null
  confidence: ResidualConfidence
  reason?:
    | 'missing-metric'
    | 'missing-production-baseline'
    | 'missing-role-score'
    | 'baseline-unavailable'
    | 'invalid-bucket'
}

const weatherThresholds =
  TEAM_PERFORMANCE_RUNTIME_VERSION === 'v3-direct'
    ? teamFlowWeatherThresholdsV3()
    : TEAM_LUCK_RESIDUAL_WEATHER_THRESHOLDS
const participantResidualCache = new Map<string, ParticipantResidual>()

function rememberParticipantResidual(key: string, value: ParticipantResidual): void {
  if (participantResidualCache.size >= TEAM_PERFORMANCE_CACHE_LIMIT) {
    const oldestKey = participantResidualCache.keys().next().value
    if (oldestKey) participantResidualCache.delete(oldestKey)
  }
  participantResidualCache.set(key, value)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFinitePositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function normalizeNickname(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase()
  return normalized ? normalized : null
}

function participantToGradeRow(participant: TeamPerformanceParticipantRow): StoredMatchGradeRow {
  return {
    gameMode: 'rank',
    characterNum: participant.characterNum,
    placement: participant.placement ?? null,
    kills: participant.kills ?? null,
    deaths: participant.deaths ?? null,
    assists: participant.assists ?? null,
    teamKills: participant.teamKills ?? null,
    damageToPlayer: participant.damageToPlayer ?? null,
    victory: participant.placement === 1,
    bestWeapon: participant.bestWeapon ?? null,
    gameDuration: participant.gameDuration ?? null,
    rawJson: participant.rawJson,
  }
}

function participantKey(participant: TeamPerformanceParticipantRow): string {
  return participant.uid ?? participant.nickname ?? `character:${participant.characterNum}`
}

function residualCacheKey(
  participant: TeamPerformanceParticipantRow,
  displaySeasonId: number,
): string {
  return [
    participant.gameId,
    participantKey(participant),
    displaySeasonId,
    participant.gameDuration ?? 'duration:null',
    TEAM_PERFORMANCE_BENCHMARK_VERSION,
    TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
    TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
  ].join(':')
}

function confidenceForFallback(level: ResidualFallbackLevel | null): ResidualConfidence {
  if (level === 'L0') return 'high'
  if (level === 'L1' || level === 'L2') return 'medium'
  return 'low'
}

function worseFallbackLevel(
  current: ResidualFallbackLevel | null,
  next: ResidualFallbackLevel | null,
): ResidualFallbackLevel | null {
  if (!current) return next
  if (!next) return current
  return RESIDUAL_FALLBACK_LEVELS.indexOf(next) > RESIDUAL_FALLBACK_LEVELS.indexOf(current) ? next : current
}

function lowerConfidence(current: ResidualConfidence, next: ResidualConfidence): ResidualConfidence {
  const order: ResidualConfidence[] = ['high', 'medium', 'low']
  return order.indexOf(next) > order.indexOf(current) ? next : current
}

function computeParticipantResidual(
  participant: TeamPerformanceParticipantRow,
  displaySeasonId: number,
): ParticipantResidual {
  const cacheKey = residualCacheKey(participant, displaySeasonId)
  const cached = participantResidualCache.get(cacheKey)
  if (cached) return cached

  const rpAfter = participant.rpAfter
  const gameDuration = participant.gameDuration
  const weaponTypeId = participant.bestWeapon
  if (
    !isFinitePositiveNumber(rpAfter) ||
    !isFinitePositiveNumber(gameDuration) ||
    !isFinitePositiveNumber(weaponTypeId) ||
    !isFiniteNumber(participant.placement)
  ) {
    const empty: ParticipantResidual = {
      participantKey: participantKey(participant),
      residual: null,
      actualRolePerformanceScore: null,
      expectedRolePerformanceScore: null,
      fallbackLevel: null,
      sampleCount: null,
      confidence: 'low',
      reason: 'missing-metric',
    }
    rememberParticipantResidual(cacheKey, empty)
    return empty
  }

  const tier = normalizeRankTier({ rp: rpAfter, displaySeason: displaySeasonId })
  const tierKey = rankTierToGradeBaselineKey(tier)
  const role = tierKey ? lookupCharacterWeaponRole(participant.characterNum, weaponTypeId) : null
  const productionGradeBaseline = tierKey
    ? lookupBaselineMetricsAtTier(tierKey, participant.characterNum, weaponTypeId)
    : null
  if (!tierKey || !role || !productionGradeBaseline) {
    const empty: ParticipantResidual = {
      participantKey: participantKey(participant),
      residual: null,
      actualRolePerformanceScore: null,
      expectedRolePerformanceScore: null,
      fallbackLevel: null,
      sampleCount: null,
      confidence: 'low',
      reason: 'missing-production-baseline',
    }
    rememberParticipantResidual(cacheKey, empty)
    return empty
  }

  const grade = computeMatchPerformanceGrade({
    row: participantToGradeRow(participant),
    playerTier: tier,
    displaySeasonId,
  })
  const actual = grade.matchGradeRoleScore
  const baseline = resolveResidualRoleBaseline({
    season: displaySeasonId,
    mode: 'rank',
    tier: tierKey,
    characterNum: participant.characterNum,
    weaponTypeId,
    role,
    placement: participant.placement,
    durationSeconds: gameDuration,
  })
  const expected = baseline.expectedRolePerformanceScore

  const result: ParticipantResidual = {
    participantKey: participantKey(participant),
    residual: actual != null && expected != null ? round2(actual - expected) : null,
    actualRolePerformanceScore: actual ?? null,
    expectedRolePerformanceScore: expected,
    fallbackLevel: baseline.fallbackLevel,
    sampleCount: baseline.sampleCount,
    confidence: baseline.confidence,
    reason:
      actual == null
        ? 'missing-role-score'
        : expected == null
          ? baseline.reason === 'invalid-bucket'
            ? 'invalid-bucket'
            : 'baseline-unavailable'
          : undefined,
  }
  rememberParticipantResidual(cacheKey, result)
  return result
}

function computeParticipantDirectV3(
  participant: TeamPerformanceParticipantRow,
  displaySeasonId: number,
): ParticipantResidual {
  const cacheKey = `v3:${residualCacheKey(participant, displaySeasonId)}`
  const cached = participantResidualCache.get(cacheKey)
  if (cached) return cached

  const rpAfter = participant.rpAfter
  const gameDuration = participant.gameDuration
  const weaponTypeId = participant.bestWeapon
  if (
    !isFinitePositiveNumber(rpAfter) ||
    !isFinitePositiveNumber(gameDuration) ||
    !isFinitePositiveNumber(weaponTypeId) ||
    !isFiniteNumber(participant.placement)
  ) {
    const empty: ParticipantResidual = {
      participantKey: participantKey(participant),
      residual: null,
      actualRolePerformanceScore: null,
      expectedRolePerformanceScore: null,
      fallbackLevel: null,
      sampleCount: null,
      confidence: 'low',
      reason: 'missing-metric',
    }
    rememberParticipantResidual(cacheKey, empty)
    return empty
  }

  const tier = normalizeRankTier({ rp: rpAfter, displaySeason: displaySeasonId })
  const tierKey = rankTierToGradeBaselineKey(tier)
  const role = tierKey ? lookupCharacterWeaponRole(participant.characterNum, weaponTypeId) : null
  if (!tierKey || !role) {
    const empty: ParticipantResidual = {
      participantKey: participantKey(participant),
      residual: null,
      actualRolePerformanceScore: null,
      expectedRolePerformanceScore: null,
      fallbackLevel: null,
      sampleCount: null,
      confidence: 'low',
      reason: 'missing-production-baseline',
    }
    rememberParticipantResidual(cacheKey, empty)
    return empty
  }

  const scored = computeAdjustedContributionV3({
    tierKey,
    characterNum: participant.characterNum,
    weaponTypeId,
    role,
    placement: participant.placement,
    durationSeconds: gameDuration,
    damageToPlayer: participant.damageToPlayer ?? null,
    kills: participant.kills ?? null,
    assists: participant.assists ?? null,
    teamKills: participant.teamKills ?? null,
    deaths: participant.deaths ?? null,
    visionScore: null,
    monsterKill: null,
  })

  const center = teamFlowCenterV3()
  const result: ParticipantResidual = {
    participantKey: participantKey(participant),
    residual: scored ? round2(scored.adjustedContribution - center) : null,
    actualRolePerformanceScore: scored?.roleScore ?? null,
    expectedRolePerformanceScore: center,
    fallbackLevel: null,
    sampleCount: scored?.placementEffectSampleCount ?? null,
    confidence:
      scored == null
        ? 'low'
        : scored.roleScoreDetail.baselineLevel === 'exact' &&
            scored.placementEffectFallbackLevel === 'role-placement'
          ? 'high'
          : scored.roleScoreDetail.baselineLevel === 'tier-overall'
            ? 'low'
            : 'medium',
    reason: scored == null ? 'baseline-unavailable' : undefined,
  }
  rememberParticipantResidual(cacheKey, result)
  return result
}

export function resolveTeammatePerformanceLabel(
  score: number,
): '최상' | '좋음' | '보통' | '나쁨' | '최악' {
  if (score >= weatherThresholds.p90) return '최상'
  if (score >= weatherThresholds.p70) return '좋음'
  if (score > weatherThresholds.p30) return '보통'
  if (score > weatherThresholds.p10) return '나쁨'
  return '최악'
}

export function resolveCarryBurdenLabel(delta: number): string {
  if (delta >= 15) return '매우 높은 캐리 부담'
  if (delta >= 7) return '높은 캐리 부담'
  if (delta > -7) return '균형'
  if (delta > -15) return '낮은 캐리 부담'
  return '팀원 성과 우세'
}

function unavailableTeamPerformance(
  reason: TeamPerformanceReasonContract,
  ownResidual: ParticipantResidual | null = null,
): TeamPerformanceContract {
  return {
    status: 'unavailable',
    reason,
    teammateCount: 0,
    gradedTeammateCount: 0,
    ownPerformanceScore: ownResidual?.residual ?? null,
    teammatePerformanceScore: null,
    teammatePerformanceDelta: null,
    teammatePerformanceLabel: null,
    carryBurdenDelta: null,
    carryBurdenLabel: null,
    teamMetricVersion: TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
    residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
    benchmarkVersion: TEAM_PERFORMANCE_BENCHMARK_VERSION,
    teamLuckResidual: null,
    teamLuckLabel: null,
    ownResidual: ownResidual?.residual ?? null,
    ownRolePerformanceScore: ownResidual?.actualRolePerformanceScore ?? null,
    expectedRolePerformanceScore: ownResidual?.expectedRolePerformanceScore ?? null,
    teammateResidualAverage: null,
    carryBurdenResidual: null,
    confidence: ownResidual?.confidence ?? 'low',
    fallbackLevel: ownResidual?.fallbackLevel ?? null,
    sampleCount: ownResidual?.sampleCount ?? null,
  }
}

export function computeTeamPerformanceForMatch(
  params: ComputeTeamPerformanceParams,
): TeamPerformanceContract | undefined {
  const { match, ownerUid, participants, displaySeasonId } = params
  if (!isGradeSupportedMode(match.gameMode)) return undefined

  const ownerNickname = normalizeNickname(params.ownerNickname)
  const isOwner = (participant: TeamPerformanceParticipantRow) =>
    participant.uid === ownerUid ||
    (participant.uid == null &&
      ownerNickname != null &&
      normalizeNickname(participant.nickname) === ownerNickname)

  const sameMatchParticipants = participants.filter((participant) => participant.gameId === match.matchId)
  const owner = sameMatchParticipants.find(isOwner) ?? null
  const reasonForMissingOwner: TeamPerformanceReasonContract =
    sameMatchParticipants.length === 0 ? 'missing-participants' : 'missing-team-number'
  if (!owner || owner.teamNumber == null) return unavailableTeamPerformance(reasonForMissingOwner)

  const computeParticipant =
    TEAM_PERFORMANCE_RUNTIME_VERSION === 'v3-direct'
      ? computeParticipantDirectV3
      : computeParticipantResidual
  const ownerResidual = computeParticipant(owner, displaySeasonId)
  const teammates = sameMatchParticipants.filter(
    (participant) => participant.teamNumber === owner.teamNumber && !isOwner(participant),
  )
  if (teammates.length === 0) return unavailableTeamPerformance('missing-teammates', ownerResidual)

  const teammateResiduals = teammates.map((participant) =>
    computeParticipant(participant, displaySeasonId),
  )
  const usableTeammates = teammateResiduals.filter((row) => row.residual != null)
  const gradedTeammateCount = usableTeammates.length
  if (gradedTeammateCount === 0) return unavailableTeamPerformance('missing-grade-input', ownerResidual)

  const teammateResidualAverage = round2(
    usableTeammates.reduce((sum, row) => sum + (row.residual ?? 0), 0) / gradedTeammateCount,
  )
  const ownResidualValue = ownerResidual.residual
  const carryBurdenResidual =
    ownResidualValue != null ? round2(ownResidualValue - teammateResidualAverage) : null
  let fallbackLevel = ownerResidual.fallbackLevel
  let confidence = ownerResidual.confidence
  let sampleCount = ownerResidual.sampleCount
  for (const row of usableTeammates) {
    fallbackLevel = worseFallbackLevel(fallbackLevel, row.fallbackLevel)
    confidence = lowerConfidence(confidence, row.confidence)
    if (row.sampleCount != null) sampleCount = sampleCount == null ? row.sampleCount : Math.min(sampleCount, row.sampleCount)
  }

  const teamLuckLabel = resolveTeammatePerformanceLabel(teammateResidualAverage)
  return {
    status: gradedTeammateCount >= 2 ? 'ready' : 'partial',
    reason: gradedTeammateCount >= 2 ? undefined : 'partial-one-teammate',
    teammateCount: teammates.length,
    gradedTeammateCount,
    ownPerformanceScore: ownResidualValue,
    teammatePerformanceScore: teammateResidualAverage,
    teammatePerformanceDelta: teammateResidualAverage,
    teammatePerformanceLabel: teamLuckLabel,
    carryBurdenDelta: carryBurdenResidual,
    carryBurdenLabel:
      carryBurdenResidual != null ? resolveCarryBurdenLabel(carryBurdenResidual) : null,
    teamMetricVersion: TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
    residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
    benchmarkVersion: TEAM_PERFORMANCE_BENCHMARK_VERSION,
    teamLuckResidual: teammateResidualAverage,
    teamLuckLabel,
    ownResidual: ownResidualValue,
    ownRolePerformanceScore: ownerResidual.actualRolePerformanceScore,
    expectedRolePerformanceScore: ownerResidual.expectedRolePerformanceScore,
    teammateResidualAverage,
    carryBurdenResidual,
    confidence,
    fallbackLevel,
    sampleCount,
  }
}

export function computeTeamPerformanceSourceFingerprint(params: {
  ownerUid: string
  ownerNickname?: string | null
  match: MatchSummaryContract
  participants: ReadonlyArray<TeamPerformanceParticipantRow>
  displaySeasonId: number
}): string {
  const source = {
    ownerUid: params.ownerUid,
    ownerNickname: normalizeNickname(params.ownerNickname),
    matchId: params.match.matchId,
    displaySeasonId: params.displaySeasonId,
    teamMetricVersion: TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
    residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
    benchmarkVersion: TEAM_PERFORMANCE_BENCHMARK_VERSION,
    participants: params.participants
      .filter((row) => row.gameId === params.match.matchId)
      .map((row) => ({
        uid: row.uid ?? null,
        nickname: normalizeNickname(row.nickname),
        teamNumber: row.teamNumber ?? null,
        placement: row.placement ?? null,
        characterNum: row.characterNum,
        kills: row.kills ?? null,
        deaths: row.deaths ?? null,
        assists: row.assists ?? null,
        teamKills: row.teamKills ?? null,
        damageToPlayer: row.damageToPlayer ?? null,
        rpAfter: row.rpAfter ?? null,
        bestWeapon: row.bestWeapon ?? null,
        gameDuration: row.gameDuration ?? null,
      }))
      .sort((a, b) =>
        `${a.teamNumber ?? ''}:${a.uid ?? ''}:${a.nickname ?? ''}:${a.characterNum}`.localeCompare(
          `${b.teamNumber ?? ''}:${b.uid ?? ''}:${b.nickname ?? ''}:${b.characterNum}`,
        ),
      ),
  }
  return createHash('sha256').update(JSON.stringify(source)).digest('hex')
}

export function summarizeTeamPerformance(
  matches: ReadonlyArray<MatchSummaryContract>,
): TeamPerformanceSummaryContract {
  const candidates = matches
    .map((match) => match.teamPerformance)
    .filter((teamPerformance): teamPerformance is TeamPerformanceContract => teamPerformance != null)
  const usable = candidates.filter(
    (teamPerformance) =>
      (teamPerformance.status === 'ready' || teamPerformance.status === 'partial') &&
      teamPerformance.teammatePerformanceScore != null &&
      teamPerformance.carryBurdenDelta != null,
  )
  const readyMatches = candidates.filter((teamPerformance) => teamPerformance.status === 'ready')
    .length
  const partialMatches = candidates.filter((teamPerformance) => teamPerformance.status === 'partial')
    .length
  const unavailableMatches = candidates.filter(
    (teamPerformance) => teamPerformance.status === 'unavailable',
  ).length

  return {
    sampleSize: usable.length,
    readyMatches,
    partialMatches,
    unavailableMatches,
    averageTeammatePerformanceScore:
      usable.length > 0
        ? round2(
            usable.reduce(
              (sum, teamPerformance) => sum + (teamPerformance.teammatePerformanceScore ?? 0),
              0,
            ) / usable.length,
          )
        : null,
    averageCarryBurdenDelta:
      usable.length > 0
        ? round2(
            usable.reduce((sum, teamPerformance) => sum + (teamPerformance.carryBurdenDelta ?? 0), 0) /
              usable.length,
          )
        : null,
    highCarryBurdenMatches: usable.filter(
      (teamPerformance) => (teamPerformance.carryBurdenDelta ?? 0) >= 7,
    ).length,
    lowTeammatePerformanceMatches: usable.filter(
      (teamPerformance) => (teamPerformance.teammatePerformanceScore ?? 0) <= weatherThresholds.p10,
    ).length,
  }
}

export function clearTeamPerformanceCache(): void {
  participantResidualCache.clear()
}

export function teamPerformanceCacheSize(): number {
  return participantResidualCache.size
}
