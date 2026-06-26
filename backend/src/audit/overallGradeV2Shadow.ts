import { createHash } from 'node:crypto'

import { lookupCharacterWeaponRole } from '../services/characterPerformanceGrade/baselineStore.js'
import {
  FINE_GRADE_CUTS,
  ROLE_PRESET_WEIGHTS,
  scoreToFineGrade,
  type CharacterFineGrade,
  type CharacterGradeRole,
  type RoleMetricKey,
} from '../services/characterPerformanceGrade/config.js'
import { weightedScore } from '../services/characterPerformanceGrade/metrics.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import { isGradeSupportedMode } from '../types/matchesMode.js'
import { normalizeRankTier } from '../utils/rankTier.js'

export const OVERALL_GRADE_V2_ARTIFACT_VERSION = 'overall-grade-v2-shadow.v1'
export const OVERALL_GRADE_V2_SOURCE = 'experimental-player-matches-shadow'

export type OverallV2ConfidenceLabel = 'high' | 'medium' | 'low' | 'insufficient'
export type OverallV2FallbackLevel =
  | 'exact'
  | 'adjacent-tier'
  | 'all-tier-role'
  | 'tier-all-role'
  | 'unavailable'

export interface OverallV2IdentityMap {
  canonicalUidBySourceUid: Map<string, string>
  canonicalUserNumByCanonicalUid: Map<string, string>
}

export interface OverallV2MatchInput {
  uid: string
  gameId: string
  apiSeasonId: number
  displaySeasonId: number
  gameMode: string
  playedAt: Date | string
  characterNum: number
  bestWeapon: number | null
  rpAfter: number | null
  placement: number | null
  victory: boolean | null
  kills: number | null
  assists: number | null
  deaths: number | null
  teamKills: number | null
  damageToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
  gameDuration: number | null
  matchGradeScore: number | null
}

export interface DataAvailabilityAudit {
  available: string[]
  derivable: string[]
  missing: string[]
  unreliable: string[]
}

export interface OverallV2MetricScore {
  score: number | null
  empiricalPercentile: number | null
  cohortPlayerSeasonCount: number
  benchmarkKey: string | null
  fallbackLevel: OverallV2FallbackLevel
  metricCoverage: number
}

export interface OverallV2PlayerSeasonRow {
  canonicalUserNum: string
  canonicalUidHash: string
  seasonId: number
  matchMode: 'rank'
  tierBand: string
  primaryRole: CharacterGradeRole | null
  primaryRoleMatchShare: number
  mixedRole: boolean
  matchCount: number
  sourceMatchCount: number
  deduplicatedMatchCount: number
  firstPlayedAt: string | null
  lastPlayedAt: string | null
  outcomeMetrics: {
    winRate: number | null
    top2Rate: number | null
    top3Rate: number | null
    averagePlacement: number | null
    bottomRate: number | null
  }
  roleMetrics: Partial<Record<RoleMetricKey, number>>
  consistencyMetrics: {
    medianMatchPerformanceScore: number | null
    lowerQuartileMatchPerformanceScore: number | null
    matchPerformanceStdDev: number | null
    cOrLowerMatchRate: number | null
    aOrHigherMatchRate: number | null
    worstMatchRate: number | null
    maxConsecutiveLowPerformance: number | null
  }
  outcomePerformanceScore: number | null
  rolePerformanceScore: number | null
  consistencyScore: number | null
  outcomeEmpiricalPercentile: number | null
  roleEmpiricalPercentile: number | null
  consistencyEmpiricalPercentile: number | null
  overallV2Score: number | null
  overallV2Grade: CharacterFineGrade | null
  broadThresholdGrade: CharacterFineGrade | null
  quantileCandidateGrade: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D' | null
  confidence: number
  confidenceLabel: OverallV2ConfidenceLabel
  benchmarkKey: string | null
  cohortPlayerSeasonCount: number
  fallbackLevel: OverallV2FallbackLevel
  completeness: {
    outcome: boolean
    role: boolean
    consistency: boolean
    metricCoverage: number
    reasons: string[]
  }
  componentContributions: {
    outcome: number | null
    role: number | null
    consistency: number | null
  }
}

export interface OverallV2CohortSummary {
  key: string
  seasonId: number
  matchMode: 'rank'
  tierBand: string
  primaryRole: CharacterGradeRole | 'all-role'
  playerSeasonCount: number
  totalMatchCount: number
  metricCoverage: number
  tierDistribution: Record<string, number>
  roleDistribution: Record<string, number>
}

export interface OverallV2Artifact {
  schemaVersion: 1
  artifactVersion: typeof OVERALL_GRADE_V2_ARTIFACT_VERSION
  source: typeof OVERALL_GRADE_V2_SOURCE
  generatedAt: string
  rows: OverallV2PlayerSeasonRow[]
  cohorts: OverallV2CohortSummary[]
}

export interface OverallV2BuildOptions {
  generatedAt?: string
  minCohortSize?: number
  percentileMinCohortSize?: number
  leaveOneCanonicalUserNum?: string | null
}

interface RawPlayerSeason {
  canonicalUserNum: string
  canonicalUid: string
  seasonId: number
  matchMode: 'rank'
  matches: OverallV2MatchInput[]
  tierBand: string
  primaryRole: CharacterGradeRole | null
  primaryRoleMatchShare: number
  mixedRole: boolean
  outcomeMetrics: OverallV2PlayerSeasonRow['outcomeMetrics']
  roleMetrics: Partial<Record<RoleMetricKey, number>>
  consistencyMetrics: OverallV2PlayerSeasonRow['consistencyMetrics']
}

const DEFAULT_MIN_COHORT_SIZE = 12
const DEFAULT_PERCENTILE_MIN_COHORT_SIZE = 20
const ROLE_TIE_BREAK: CharacterGradeRole[] = [
  '평타 딜러',
  '스증 딜러',
  '암살자',
  '평타 브루저',
  '스증 브루저',
  '탱커',
  '서포터',
]
const TIER_ORDER = [
  'iron',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'platinum_plus',
  'diamond_plus',
  'meteorite_plus',
  'mithril_plus',
  'in1000',
]

export function auditOverallV2DataAvailability(): DataAvailabilityAudit {
  return {
    available: [
      'canonical player identity via profile_identity_aliases/profile_nickname_bindings when mapped',
      'seasonId via player_matches.display_season_id/api_season_id',
      'gameMode via player_matches.game_mode',
      'tier/RP via player_matches.rp_after',
      'characterNum',
      'weaponType via best_weapon',
      'gameRank via placement',
      'win/top2/top3 via placement/victory',
      'kills',
      'assists',
      'teamKills',
      'damageToPlayer',
      'vision via view_contribution',
      'survivalTime via game_duration',
      'matchId via game_id',
      'playedAt',
    ],
    derivable: [
      'rolePreset from fixed character+weapon role map',
      'tierBand from RP and season ladder',
      'current match performanceScore by reusing read-only computeMatchPerformanceGrade',
      'damageToWildAnimal proxy from monster_kill structured metric',
      'consistency metrics from match performance score distribution',
    ],
    missing: ['credits on player_matches'],
    unreliable: [
      'canonical userNum for uid values without nickname binding; artifact uses deterministic shadow id for those rows',
      'vision/damageToWildAnimal coverage depends on role_metrics_version and stored structured metrics',
      'searched-user corpus is biased and not a production benchmark sample',
    ],
  }
}

export function stableShadowUserNum(uid: string): string {
  return `shadow-${createHash('sha256').update(uid).digest('hex').slice(0, 16)}`
}

export function canonicalizeUid(uid: string, identities: OverallV2IdentityMap): {
  canonicalUid: string
  canonicalUserNum: string
} {
  const canonicalUid = identities.canonicalUidBySourceUid.get(uid) ?? uid
  return {
    canonicalUid,
    canonicalUserNum:
      identities.canonicalUserNumByCanonicalUid.get(canonicalUid) ?? stableShadowUserNum(canonicalUid),
  }
}

export function benchmarkKey(params: {
  seasonId: number
  matchMode: 'rank'
  tierBand: string
  primaryRole: CharacterGradeRole | 'all-role' | null
}): string | null {
  if (!params.primaryRole) return null
  return `${params.seasonId}:${params.matchMode}:${params.tierBand}:${params.primaryRole}`
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function quantile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low] ?? null
  const fraction = index - low
  const lowValue = sorted[low] ?? 0
  const highValue = sorted[high] ?? lowValue
  return lowValue * (1 - fraction) + highValue * fraction
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null
  const avg = mean(values)
  if (avg == null) return null
  const variance = mean(values.map((value) => (value - avg) ** 2))
  return variance == null ? null : Math.sqrt(variance)
}

function ratio(count: number, total: number): number | null {
  if (total <= 0) return null
  return count / total
}

function empiricalRankScore(
  value: number | null | undefined,
  cohortValues: number[],
  higherBetter: boolean,
): number | null {
  if (value == null || !Number.isFinite(value) || cohortValues.length === 0) return null
  let lower = 0
  let equal = 0
  for (const cohortValue of cohortValues) {
    if (!Number.isFinite(cohortValue)) continue
    if (higherBetter) {
      if (cohortValue < value) lower += 1
      if (cohortValue === value) equal += 1
    } else {
      if (cohortValue > value) lower += 1
      if (cohortValue === value) equal += 1
    }
  }
  return ((lower + equal * 0.5) / cohortValues.length) * 100
}

function percentileOfScore(
  value: number | null,
  cohortScores: number[],
  minCohortSize: number,
): number | null {
  if (value == null || cohortScores.length < minCohortSize) return null
  return round(empiricalRankScore(value, cohortScores, true), 4)
}

function latestMatch(matches: OverallV2MatchInput[]): OverallV2MatchInput | null {
  return [...matches].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())[0] ?? null
}

function resolveTierBand(matches: OverallV2MatchInput[]): string {
  const latest = latestMatch(matches)
  const tier = normalizeRankTier({
    rp: latest?.rpAfter ?? null,
    displaySeason: latest?.displaySeasonId ?? null,
  })
  return rankTierToGradeBaselineKey(tier) ?? 'unranked'
}

function resolvePrimaryRole(matches: OverallV2MatchInput[]): {
  role: CharacterGradeRole | null
  share: number
  mixed: boolean
} {
  const counts = new Map<CharacterGradeRole, number>()
  let mapped = 0
  for (const match of matches) {
    if (match.bestWeapon == null || match.bestWeapon <= 0) continue
    const role = lookupCharacterWeaponRole(match.characterNum, match.bestWeapon)
    if (!role) continue
    mapped += 1
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }
  if (mapped === 0) return { role: null, share: 0, mixed: true }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return ROLE_TIE_BREAK.indexOf(a[0]) - ROLE_TIE_BREAK.indexOf(b[0])
  })
  const [role, count] = sorted[0] ?? [null, 0]
  const share = count / mapped
  return { role, share, mixed: share < 0.45 }
}

function buildRawRoleMetrics(matches: OverallV2MatchInput[]): Partial<Record<RoleMetricKey, number>> {
  const values = {
    damageToPlayer: matches.flatMap((row) => row.damageToPlayer == null ? [] : [row.damageToPlayer]),
    playerKill: matches.flatMap((row) => row.kills == null ? [] : [row.kills]),
    teamKill: matches.flatMap((row) => row.teamKills == null ? [] : [row.teamKills]),
    playerAssistant: matches.flatMap((row) => row.assists == null ? [] : [row.assists]),
    survival: matches.flatMap((row) => row.deaths == null ? [] : [row.deaths]),
    viewContribution: matches.flatMap((row) => row.viewContribution == null ? [] : [row.viewContribution]),
    monsterKill: matches.flatMap((row) => row.monsterKill == null ? [] : [row.monsterKill]),
  } satisfies Record<RoleMetricKey, number[]>

  const out: Partial<Record<RoleMetricKey, number>> = {}
  for (const key of Object.keys(values) as RoleMetricKey[]) {
    const avg = mean(values[key])
    if (avg != null) out[key] = avg
  }
  return out
}

function maxConsecutiveLow(scoresByTimeAsc: number[]): number {
  let best = 0
  let current = 0
  for (const score of scoresByTimeAsc) {
    if (score < 50) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

function buildRawPlayerSeasonRows(
  matches: OverallV2MatchInput[],
  identities: OverallV2IdentityMap,
): RawPlayerSeason[] {
  const dedupedByKey = new Map<string, OverallV2MatchInput>()
  for (const match of matches) {
    if (!isGradeSupportedMode(match.gameMode)) continue
    const identity = canonicalizeUid(match.uid, identities)
    const key = `${identity.canonicalUid}:${match.displaySeasonId}:rank:${match.gameId}`
    const existing = dedupedByKey.get(key)
    if (!existing || new Date(match.playedAt).getTime() > new Date(existing.playedAt).getTime()) {
      dedupedByKey.set(key, match)
    }
  }

  const groups = new Map<string, { canonicalUid: string; canonicalUserNum: string; matches: OverallV2MatchInput[] }>()
  for (const match of dedupedByKey.values()) {
    const identity = canonicalizeUid(match.uid, identities)
    const key = `${identity.canonicalUserNum}:${match.displaySeasonId}:rank`
    const bucket = groups.get(key) ?? {
      canonicalUid: identity.canonicalUid,
      canonicalUserNum: identity.canonicalUserNum,
      matches: [],
    }
    bucket.matches.push(match)
    groups.set(key, bucket)
  }

  return [...groups.values()].map((group) => {
    const seasonId = group.matches[0]?.displaySeasonId ?? 0
    const tierBand = resolveTierBand(group.matches)
    const primary = resolvePrimaryRole(group.matches)
    const placements = group.matches.flatMap((row) => row.placement == null ? [] : [row.placement])
    const scores = group.matches.flatMap((row) => row.matchGradeScore == null ? [] : [row.matchGradeScore])
    const scoresByTimeAsc = [...group.matches]
      .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
      .flatMap((row) => row.matchGradeScore == null ? [] : [row.matchGradeScore])
    const matchCount = group.matches.length
    return {
      canonicalUserNum: group.canonicalUserNum,
      canonicalUid: group.canonicalUid,
      seasonId,
      matchMode: 'rank' as const,
      matches: group.matches,
      tierBand,
      primaryRole: primary.role,
      primaryRoleMatchShare: primary.share,
      mixedRole: primary.mixed,
      outcomeMetrics: {
        winRate: ratio(group.matches.filter((row) => row.victory === true || row.placement === 1).length, matchCount),
        top2Rate: ratio(placements.filter((placement) => placement <= 2).length, placements.length),
        top3Rate: ratio(placements.filter((placement) => placement <= 3).length, placements.length),
        averagePlacement: mean(placements),
        bottomRate: ratio(placements.filter((placement) => placement >= 7).length, placements.length),
      },
      roleMetrics: buildRawRoleMetrics(group.matches),
      consistencyMetrics: {
        medianMatchPerformanceScore: quantile(scores, 0.5),
        lowerQuartileMatchPerformanceScore: quantile(scores, 0.25),
        matchPerformanceStdDev: stddev(scores),
        cOrLowerMatchRate: ratio(scores.filter((score) => score < 56).length, scores.length),
        aOrHigherMatchRate: ratio(scores.filter((score) => score >= 72).length, scores.length),
        worstMatchRate: ratio(scores.filter((score) => score < 38).length, scores.length),
        maxConsecutiveLowPerformance: scoresByTimeAsc.length > 0 ? maxConsecutiveLow(scoresByTimeAsc) : null,
      },
    }
  }).sort((a, b) =>
    a.canonicalUserNum.localeCompare(b.canonicalUserNum) ||
    a.seasonId - b.seasonId ||
    a.matchMode.localeCompare(b.matchMode),
  )
}

function adjacentTierBands(tierBand: string): string[] {
  const index = TIER_ORDER.indexOf(tierBand)
  if (index < 0) return []
  return [TIER_ORDER[index - 1], TIER_ORDER[index + 1]].filter((value): value is string => Boolean(value))
}

function pickCohort(params: {
  row: RawPlayerSeason
  rows: RawPlayerSeason[]
  minCohortSize: number
  leaveOneCanonicalUserNum: string | null
}): { rows: RawPlayerSeason[]; key: string | null; fallbackLevel: OverallV2FallbackLevel } {
  const base = params.rows.filter((candidate) =>
    candidate.seasonId === params.row.seasonId &&
    candidate.matchMode === params.row.matchMode &&
    candidate.primaryRole != null &&
    candidate.canonicalUserNum !== params.leaveOneCanonicalUserNum,
  )
  const exact = base.filter((candidate) =>
    candidate.tierBand === params.row.tierBand &&
    candidate.primaryRole === params.row.primaryRole,
  )
  if (exact.length >= params.minCohortSize) {
    return { rows: exact, key: benchmarkKey({ ...params.row, primaryRole: params.row.primaryRole }), fallbackLevel: 'exact' }
  }
  const adjacent = base.filter((candidate) =>
    adjacentTierBands(params.row.tierBand).includes(candidate.tierBand) &&
    candidate.primaryRole === params.row.primaryRole,
  )
  if (adjacent.length >= params.minCohortSize) {
    return {
      rows: adjacent,
      key: `${params.row.seasonId}:${params.row.matchMode}:adjacent-tier:${params.row.primaryRole}`,
      fallbackLevel: 'adjacent-tier',
    }
  }
  const allTierRole = base.filter((candidate) => candidate.primaryRole === params.row.primaryRole)
  if (allTierRole.length >= params.minCohortSize) {
    return {
      rows: allTierRole,
      key: `${params.row.seasonId}:${params.row.matchMode}:all-tier:${params.row.primaryRole}`,
      fallbackLevel: 'all-tier-role',
    }
  }
  const tierAllRole = base.filter((candidate) => candidate.tierBand === params.row.tierBand)
  if (tierAllRole.length >= params.minCohortSize) {
    return {
      rows: tierAllRole,
      key: `${params.row.seasonId}:${params.row.matchMode}:${params.row.tierBand}:all-role`,
      fallbackLevel: 'tier-all-role',
    }
  }
  return { rows: [], key: null, fallbackLevel: 'unavailable' }
}

function scoreOutcome(row: RawPlayerSeason, cohortRows: RawPlayerSeason[]): OverallV2MetricScore {
  const entries = [
    {
      key: 'top3Rate',
      score: empiricalRankScore(
        row.outcomeMetrics.top3Rate,
        cohortRows.flatMap((cohort) => cohort.outcomeMetrics.top3Rate == null ? [] : [cohort.outcomeMetrics.top3Rate]),
        true,
      ),
      weight: 45,
    },
    {
      key: 'averagePlacement',
      score: empiricalRankScore(
        row.outcomeMetrics.averagePlacement,
        cohortRows.flatMap((cohort) => cohort.outcomeMetrics.averagePlacement == null ? [] : [cohort.outcomeMetrics.averagePlacement]),
        false,
      ),
      weight: 35,
    },
    {
      key: 'bottomRate',
      score: empiricalRankScore(
        row.outcomeMetrics.bottomRate,
        cohortRows.flatMap((cohort) => cohort.outcomeMetrics.bottomRate == null ? [] : [cohort.outcomeMetrics.bottomRate]),
        false,
      ),
      weight: 20,
    },
  ]
  const available = entries.filter((entry) => entry.score != null)
  const score = available.length === entries.length ? weightedScore(available as Array<{ score: number; weight: number }>) : null
  return {
    score: round(score),
    empiricalPercentile: null,
    cohortPlayerSeasonCount: cohortRows.length,
    benchmarkKey: null,
    fallbackLevel: 'unavailable',
    metricCoverage: available.length / entries.length,
  }
}

function scoreRole(row: RawPlayerSeason, cohortRows: RawPlayerSeason[]): OverallV2MetricScore {
  if (!row.primaryRole) {
    return {
      score: null,
      empiricalPercentile: null,
      cohortPlayerSeasonCount: cohortRows.length,
      benchmarkKey: null,
      fallbackLevel: 'unavailable',
      metricCoverage: 0,
    }
  }
  const weights = ROLE_PRESET_WEIGHTS[row.primaryRole]
  const entries = (Object.keys(weights) as RoleMetricKey[]).map((key) => ({
    key,
    score: empiricalRankScore(
      row.roleMetrics[key],
      cohortRows.flatMap((cohort) => cohort.roleMetrics[key] == null ? [] : [cohort.roleMetrics[key] as number]),
      key === 'survival' ? false : true,
    ),
    weight: weights[key],
  }))
  const available = entries.filter((entry) => entry.score != null)
  const effectiveWeight = available.reduce((sum, entry) => sum + entry.weight, 0)
  const score = effectiveWeight >= 70
    ? weightedScore(available as Array<{ score: number; weight: number }>)
    : null
  return {
    score: round(score),
    empiricalPercentile: null,
    cohortPlayerSeasonCount: cohortRows.length,
    benchmarkKey: null,
    fallbackLevel: 'unavailable',
    metricCoverage: effectiveWeight / 100,
  }
}

function scoreConsistency(row: RawPlayerSeason, cohortRows: RawPlayerSeason[]): OverallV2MetricScore {
  const entries = [
    {
      key: 'medianMatchPerformanceScore',
      score: empiricalRankScore(
        row.consistencyMetrics.medianMatchPerformanceScore,
        cohortRows.flatMap((cohort) => cohort.consistencyMetrics.medianMatchPerformanceScore == null ? [] : [cohort.consistencyMetrics.medianMatchPerformanceScore]),
        true,
      ),
      weight: 35,
    },
    {
      key: 'lowerQuartileMatchPerformanceScore',
      score: empiricalRankScore(
        row.consistencyMetrics.lowerQuartileMatchPerformanceScore,
        cohortRows.flatMap((cohort) => cohort.consistencyMetrics.lowerQuartileMatchPerformanceScore == null ? [] : [cohort.consistencyMetrics.lowerQuartileMatchPerformanceScore]),
        true,
      ),
      weight: 35,
    },
    {
      key: 'matchPerformanceStdDev',
      score: empiricalRankScore(
        row.consistencyMetrics.matchPerformanceStdDev,
        cohortRows.flatMap((cohort) => cohort.consistencyMetrics.matchPerformanceStdDev == null ? [] : [cohort.consistencyMetrics.matchPerformanceStdDev]),
        false,
      ),
      weight: 15,
    },
    {
      key: 'cOrLowerMatchRate',
      score: empiricalRankScore(
        row.consistencyMetrics.cOrLowerMatchRate,
        cohortRows.flatMap((cohort) => cohort.consistencyMetrics.cOrLowerMatchRate == null ? [] : [cohort.consistencyMetrics.cOrLowerMatchRate]),
        false,
      ),
      weight: 15,
    },
  ]
  const available = entries.filter((entry) => entry.score != null)
  const score = available.length === entries.length ? weightedScore(available as Array<{ score: number; weight: number }>) : null
  return {
    score: round(score),
    empiricalPercentile: null,
    cohortPlayerSeasonCount: cohortRows.length,
    benchmarkKey: null,
    fallbackLevel: 'unavailable',
    metricCoverage: available.length / entries.length,
  }
}

function confidenceLabel(value: number): OverallV2ConfidenceLabel {
  if (value < 0.25) return 'insufficient'
  if (value < 0.5) return 'low'
  if (value < 0.75) return 'medium'
  return 'high'
}

function computeConfidence(params: {
  matchCount: number
  metricCoverage: number
  cohortCount: number
  roleShare: number
  fallbackLevel: OverallV2FallbackLevel
}): number {
  const matchFactor = Math.min(1, params.matchCount / 40)
  const cohortFactor = Math.min(1, params.cohortCount / 40)
  const roleFactor = params.roleShare
  const fallbackFactor = {
    exact: 1,
    'adjacent-tier': 0.82,
    'all-tier-role': 0.72,
    'tier-all-role': 0.62,
    unavailable: 0,
  } satisfies Record<OverallV2FallbackLevel, number>
  return round(
    matchFactor * 0.3 +
    params.metricCoverage * 0.25 +
    cohortFactor * 0.25 +
    roleFactor * 0.1 +
    fallbackFactor[params.fallbackLevel] * 0.1,
    4,
  ) ?? 0
}

function quantileGrade(score: number | null, scores: number[]): OverallV2PlayerSeasonRow['quantileCandidateGrade'] {
  if (score == null || scores.length < DEFAULT_PERCENTILE_MIN_COHORT_SIZE) return null
  const empirical = empiricalRankScore(score, scores, true)
  if (empirical == null) return null
  if (empirical >= 97) return 'S+'
  if (empirical >= 90) return 'S'
  if (empirical >= 70) return 'A'
  if (empirical >= 35) return 'B'
  if (empirical >= 15) return 'C'
  return 'D'
}

function buildCohorts(rows: OverallV2PlayerSeasonRow[]): OverallV2CohortSummary[] {
  const map = new Map<string, OverallV2PlayerSeasonRow[]>()
  for (const row of rows) {
    if (!row.primaryRole) continue
    const key = benchmarkKey(row)
    if (!key) continue
    const bucket = map.get(key) ?? []
    bucket.push(row)
    map.set(key, bucket)
  }
  return [...map.entries()].map(([key, bucket]) => {
    const first = bucket[0]
    const tierDistribution: Record<string, number> = {}
    const roleDistribution: Record<string, number> = {}
    for (const row of bucket) {
      tierDistribution[row.tierBand] = (tierDistribution[row.tierBand] ?? 0) + 1
      const role = row.primaryRole ?? 'unknown'
      roleDistribution[role] = (roleDistribution[role] ?? 0) + 1
    }
    return {
      key,
      seasonId: first?.seasonId ?? 0,
      matchMode: 'rank' as const,
      tierBand: first?.tierBand ?? 'unknown',
      primaryRole: (first?.primaryRole ?? 'all-role') as CharacterGradeRole | 'all-role',
      playerSeasonCount: bucket.length,
      totalMatchCount: bucket.reduce((sum, row) => sum + row.matchCount, 0),
      metricCoverage: round(mean(bucket.map((row) => row.completeness.metricCoverage)) ?? 0, 4) ?? 0,
      tierDistribution,
      roleDistribution,
    }
  }).sort((a, b) => a.key.localeCompare(b.key))
}

export function buildOverallGradeV2ShadowArtifact(
  matches: OverallV2MatchInput[],
  identities: OverallV2IdentityMap,
  options: OverallV2BuildOptions = {},
): OverallV2Artifact {
  const minCohortSize = options.minCohortSize ?? DEFAULT_MIN_COHORT_SIZE
  const percentileMinCohortSize = options.percentileMinCohortSize ?? DEFAULT_PERCENTILE_MIN_COHORT_SIZE
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const leaveOneCanonicalUserNum = options.leaveOneCanonicalUserNum ?? null
  const rawRows = buildRawPlayerSeasonRows(matches, identities)

  const interim = rawRows.map((row) => {
    const cohort = pickCohort({ row, rows: rawRows, minCohortSize, leaveOneCanonicalUserNum })
    const outcome = cohort.rows.length > 0 ? scoreOutcome(row, cohort.rows) : null
    const role = cohort.rows.length > 0 ? scoreRole(row, cohort.rows) : null
    const consistency = cohort.rows.length > 0 ? scoreConsistency(row, cohort.rows) : null
    const outcomeScore = outcome?.score ?? null
    const roleScore = role?.score ?? null
    const consistencyScore = consistency?.score ?? null
    const componentScores = [outcomeScore, roleScore, consistencyScore]
    const metricCoverage = mean([
      outcome?.metricCoverage ?? 0,
      role?.metricCoverage ?? 0,
      consistency?.metricCoverage ?? 0,
    ]) ?? 0
    const overallV2Score =
      componentScores.every((score) => score != null)
        ? round((outcomeScore ?? 0) * 0.3 + (roleScore ?? 0) * 0.5 + (consistencyScore ?? 0) * 0.2)
        : null
    const completenessReasons = [
      outcomeScore == null ? 'missing-outcome-component' : null,
      roleScore == null ? 'missing-role-component' : null,
      consistencyScore == null ? 'missing-consistency-component' : null,
      cohort.fallbackLevel === 'unavailable' ? 'cohort-unavailable' : null,
      row.mixedRole ? 'mixed-role-share' : null,
    ].filter((reason): reason is string => reason != null)
    const confidence = computeConfidence({
      matchCount: row.matches.length,
      metricCoverage,
      cohortCount: cohort.rows.length,
      roleShare: row.primaryRoleMatchShare,
      fallbackLevel: cohort.fallbackLevel,
    })
    const times = row.matches.map((match) => new Date(match.playedAt).getTime()).filter(Number.isFinite)
    return {
      raw: row,
      cohort,
      scoreRow: {
        canonicalUserNum: row.canonicalUserNum,
        canonicalUidHash: createHash('sha256').update(row.canonicalUid).digest('hex').slice(0, 16),
        seasonId: row.seasonId,
        matchMode: row.matchMode,
        tierBand: row.tierBand,
        primaryRole: row.primaryRole,
        primaryRoleMatchShare: round(row.primaryRoleMatchShare, 4) ?? 0,
        mixedRole: row.mixedRole,
        matchCount: row.matches.length,
        sourceMatchCount: row.matches.length,
        deduplicatedMatchCount: row.matches.length,
        firstPlayedAt: times.length > 0 ? new Date(Math.min(...times)).toISOString() : null,
        lastPlayedAt: times.length > 0 ? new Date(Math.max(...times)).toISOString() : null,
        outcomeMetrics: {
          winRate: round(row.outcomeMetrics.winRate, 4),
          top2Rate: round(row.outcomeMetrics.top2Rate, 4),
          top3Rate: round(row.outcomeMetrics.top3Rate, 4),
          averagePlacement: round(row.outcomeMetrics.averagePlacement),
          bottomRate: round(row.outcomeMetrics.bottomRate, 4),
        },
        roleMetrics: Object.fromEntries(
          Object.entries(row.roleMetrics).map(([key, value]) => [key, round(value)]),
        ) as Partial<Record<RoleMetricKey, number>>,
        consistencyMetrics: {
          medianMatchPerformanceScore: round(row.consistencyMetrics.medianMatchPerformanceScore),
          lowerQuartileMatchPerformanceScore: round(row.consistencyMetrics.lowerQuartileMatchPerformanceScore),
          matchPerformanceStdDev: round(row.consistencyMetrics.matchPerformanceStdDev),
          cOrLowerMatchRate: round(row.consistencyMetrics.cOrLowerMatchRate, 4),
          aOrHigherMatchRate: round(row.consistencyMetrics.aOrHigherMatchRate, 4),
          worstMatchRate: round(row.consistencyMetrics.worstMatchRate, 4),
          maxConsecutiveLowPerformance: row.consistencyMetrics.maxConsecutiveLowPerformance,
        },
        outcomePerformanceScore: outcomeScore,
        rolePerformanceScore: roleScore,
        consistencyScore,
        outcomeEmpiricalPercentile: null,
        roleEmpiricalPercentile: null,
        consistencyEmpiricalPercentile: null,
        overallV2Score,
        overallV2Grade: overallV2Score == null ? null : scoreToFineGrade(overallV2Score),
        broadThresholdGrade: overallV2Score == null ? null : scoreToFineGrade(overallV2Score),
        quantileCandidateGrade: null,
        confidence,
        confidenceLabel: confidenceLabel(confidence),
        benchmarkKey: cohort.key,
        cohortPlayerSeasonCount: cohort.rows.length,
        fallbackLevel: cohort.fallbackLevel,
        completeness: {
          outcome: outcomeScore != null,
          role: roleScore != null,
          consistency: consistencyScore != null,
          metricCoverage: round(metricCoverage, 4) ?? 0,
          reasons: completenessReasons,
        },
        componentContributions: {
          outcome: outcomeScore == null ? null : round(outcomeScore * 0.3),
          role: roleScore == null ? null : round(roleScore * 0.5),
          consistency: consistencyScore == null ? null : round(consistencyScore * 0.2),
        },
      } satisfies OverallV2PlayerSeasonRow,
    }
  })

  const scoreByCanonicalUserNum = new Map(
    interim.map((entry) => [entry.scoreRow.canonicalUserNum, entry.scoreRow.overallV2Score]),
  )
  const componentScoreMaps = {
    outcome: new Map(interim.map((entry) => [entry.scoreRow.canonicalUserNum, entry.scoreRow.outcomePerformanceScore])),
    role: new Map(interim.map((entry) => [entry.scoreRow.canonicalUserNum, entry.scoreRow.rolePerformanceScore])),
    consistency: new Map(interim.map((entry) => [entry.scoreRow.canonicalUserNum, entry.scoreRow.consistencyScore])),
  }

  const rows = interim.map((entry) => {
    const overallScores = entry.cohort.rows.flatMap((cohortRow) => {
      const score = scoreByCanonicalUserNum.get(cohortRow.canonicalUserNum)
      return score == null ? [] : [score]
    })
    const componentCohortScores = {
      outcome: entry.cohort.rows.flatMap((cohortRow) => {
        const score = componentScoreMaps.outcome.get(cohortRow.canonicalUserNum)
        return score == null ? [] : [score]
      }),
      role: entry.cohort.rows.flatMap((cohortRow) => {
        const score = componentScoreMaps.role.get(cohortRow.canonicalUserNum)
        return score == null ? [] : [score]
      }),
      consistency: entry.cohort.rows.flatMap((cohortRow) => {
        const score = componentScoreMaps.consistency.get(cohortRow.canonicalUserNum)
        return score == null ? [] : [score]
      }),
    }
    return {
      ...entry.scoreRow,
      outcomeEmpiricalPercentile: percentileOfScore(
        entry.scoreRow.outcomePerformanceScore,
        componentCohortScores.outcome,
        percentileMinCohortSize,
      ),
      roleEmpiricalPercentile: percentileOfScore(
        entry.scoreRow.rolePerformanceScore,
        componentCohortScores.role,
        percentileMinCohortSize,
      ),
      consistencyEmpiricalPercentile: percentileOfScore(
        entry.scoreRow.consistencyScore,
        componentCohortScores.consistency,
        percentileMinCohortSize,
      ),
      quantileCandidateGrade: quantileGrade(entry.scoreRow.overallV2Score, overallScores),
    } satisfies OverallV2PlayerSeasonRow
  })

  return {
    schemaVersion: 1,
    artifactVersion: OVERALL_GRADE_V2_ARTIFACT_VERSION,
    source: OVERALL_GRADE_V2_SOURCE,
    generatedAt,
    rows,
    cohorts: buildCohorts(rows),
  }
}

export function fineGradeCutsForReport(): ReadonlyArray<{ min: number; grade: CharacterFineGrade }> {
  return FINE_GRADE_CUTS
}
