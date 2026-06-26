import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import type { SeasonCharacterAggregateContract } from '../../contracts/player.js'
import { buildCharacterAggregatesFromMatches } from '../../cache/seasonAggregateBuilder.js'
import { toMatchSummaryFromPlayerMatch } from '../../cache/playerMatchStore.js'
import { uidToUserNum } from '../../external/bserMapper.js'
import { computeParticipationCapped } from '../characterPerformanceGrade/combatParticipation.js'
import { applyCharacterPerformanceGrades } from '../characterPerformanceGrade/compute.js'
import { lookupCharacterWeaponRole } from '../characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../characterPerformanceGrade/tierKey.js'
import { computeProductionConsistencyScore } from '../analysis/productionAnalysisAxes.js'
import { computeMatchPerformanceGrade } from '../characterPerformanceGrade/compute.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import { isGradeSupportedMode } from '../../types/matchesMode.js'
import {
  BENCHMARK_ELIGIBLE_MIN_MATCHES,
  EXPLORATORY_MIN_MATCHES,
  PROVISIONAL_MIN_MATCHES,
  type PlayerCharacterSampleStatus,
} from './config.js'
import type { PlayerCharacterSnapshotMetrics } from './types.js'
import { playedAtMs } from './fingerprint.js'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function averageNullable(values: ReadonlyArray<number | null>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

export function resolveSampleStatus(eligibleMatches: number): PlayerCharacterSampleStatus {
  if (eligibleMatches >= BENCHMARK_ELIGIBLE_MIN_MATCHES) return 'benchmarkEligible'
  if (eligibleMatches >= PROVISIONAL_MIN_MATCHES) return 'provisional'
  return 'exploratory'
}

export function meetsExploratoryMinimum(eligibleMatches: number): boolean {
  return eligibleMatches >= EXPLORATORY_MIN_MATCHES
}

function resolvePlayerTier(
  rows: ReadonlyArray<PlayerMatchRow>,
  displaySeasonId: number,
): ReturnType<typeof getRankTierFromRp> | null {
  const rpValues = rows
    .map((row) => row.rpAfter)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
  if (rpValues.length === 0) return null
  const median = rpValues[Math.floor(rpValues.length / 2)] ?? rpValues[0]!
  return getRankTierFromRp(median, null, displaySeasonId)
}

function resolveTierBand(
  rows: ReadonlyArray<PlayerMatchRow>,
  displaySeasonId: number,
): string | null {
  const tier = resolvePlayerTier(rows, displaySeasonId)
  return tier ? rankTierToGradeBaselineKey(tier) : null
}

function resolvePrimaryRole(rows: ReadonlyArray<PlayerMatchRow>, characterNum: number): string | null {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const weaponTypeId = row.bestWeapon
    if (weaponTypeId == null || weaponTypeId <= 0) continue
    const role = lookupCharacterWeaponRole(characterNum, weaponTypeId)
    if (!role) continue
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? null
}

function computeShadowScore(
  rows: ReadonlyArray<PlayerMatchRow>,
  characterStat: SeasonCharacterAggregateContract,
  displaySeasonId: number,
): number | null {
  const tier = resolvePlayerTier(rows, displaySeasonId)
  if (!tier || !rankTierToGradeBaselineKey(tier)) return null
  const graded = applyCharacterPerformanceGrades({
    rows: [...rows],
    characterStats: [characterStat],
    metaStatus: 'complete',
    playerTier: tier,
  })
  const score = graded[0]?.gradeScore
  return score != null && Number.isFinite(score) ? round2(score) : null
}

function computeConsistencyScore(
  rows: ReadonlyArray<PlayerMatchRow>,
  displaySeasonId: number,
): number | null {
  const tier = resolvePlayerTier(rows, displaySeasonId)
  if (!tier) return null
  const scores: number[] = []
  for (const row of rows) {
    if (!isGradeSupportedMode(row.gameMode)) continue
    const grade = computeMatchPerformanceGrade({
      row,
      playerTier: tier,
      displaySeasonId: row.displaySeasonId ?? displaySeasonId,
    })
    if (grade.matchGradeScore != null && Number.isFinite(grade.matchGradeScore)) {
      scores.push(grade.matchGradeScore)
    }
  }
  return computeProductionConsistencyScore(scores)
}

export function aggregatePlayerCharacterSnapshot(
  rows: ReadonlyArray<PlayerMatchRow>,
  params: {
    canonicalUid: string
    characterNum: number
    displaySeasonId: number
    apiSeasonId: number
  },
): PlayerCharacterSnapshotMetrics | null {
  const characterRows = rows.filter((row) => row.characterNum === params.characterNum)
  if (characterRows.length === 0) return null

  const userNum = uidToUserNum(params.canonicalUid)
  const matches = characterRows.map((row) => toMatchSummaryFromPlayerMatch(row, userNum))
  const characterStats = buildCharacterAggregatesFromMatches(
    matches,
    params.displaySeasonId,
    params.apiSeasonId,
  )
  const characterStat = characterStats.find((row) => row.characterNum === params.characterNum)
  if (!characterStat) return null

  const placements = characterRows
    .map((row) => row.placement)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const top3Count = placements.filter((value) => value <= 3).length
  const wins = characterRows.filter((row) => row.victory === true).length
  const games = characterRows.length

  const teamKillParticipation = averageNullable(
    characterRows.map((row) =>
      computeParticipationCapped({
        playerKill: row.kills,
        playerAssistant: row.assists,
        teamKill: row.teamKills,
      }),
    ),
  )

  const damagePerMinute = averageNullable(
    characterRows.map((row) => {
      const damage = row.damageToPlayer
      const duration = row.gameDuration
      if (damage == null || duration == null || duration <= 0) return null
      return damage / (duration / 60)
    }),
  )

  const visionPerMinute = averageNullable(
    characterRows.map((row) => {
      const vision = row.viewContribution
      const duration = row.gameDuration
      if (vision == null || duration == null || duration <= 0) return null
      return vision / (duration / 60)
    }),
  )

  const averageSurvivalTime = averageNullable(
    characterRows.map((row) => {
      const duration = row.gameDuration
      return duration != null && duration > 0 ? duration : null
    }),
  )

  const playedTimes = characterRows.map(playedAtMs).filter((value) => Number.isFinite(value))
  const sampleWindowStart = new Date(Math.min(...playedTimes))
  const sampleWindowEnd = new Date(Math.max(...playedTimes))

  return {
    eligibleMatches: games,
    averagePlacement: placements.length > 0 ? round2(averageNullable(placements)! ) : null,
    winRate: games > 0 ? round2((wins / games) * 100) : null,
    top3Rate: placements.length > 0 ? round2((top3Count / placements.length) * 100) : null,
    averageKills: games > 0 ? round2((characterStat.kills ?? 0) / games) : null,
    averageDeaths: games > 0 ? round2((characterStat.deaths ?? 0) / games) : null,
    teamKillParticipation:
      teamKillParticipation == null ? null : round2(teamKillParticipation * 100),
    damagePerMinute: damagePerMinute == null ? null : round2(damagePerMinute),
    damageShare: null,
    visionPerMinute: visionPerMinute == null ? null : round2(visionPerMinute),
    averageSurvivalTime: averageSurvivalTime == null ? null : round2(averageSurvivalTime),
    consistencyScore: computeConsistencyScore(characterRows, params.displaySeasonId),
    shadowScore: computeShadowScore(characterRows, characterStat, params.displaySeasonId),
    primaryRole: resolvePrimaryRole(characterRows, params.characterNum),
    tierBand: resolveTierBand(characterRows, params.displaySeasonId),
    sampleWindowStart,
    sampleWindowEnd,
  }
}
