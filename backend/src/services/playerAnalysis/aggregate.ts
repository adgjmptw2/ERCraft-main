import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { lookupCharacterWeaponRole } from '../characterPerformanceGrade/baselineStore.js'
import { computeParticipationCapped } from '../characterPerformanceGrade/combatParticipation.js'
import { buildProductionAnalysisAxesForRows } from '../analysis/productionAnalysisAxes.js'
import { computeProductionConsistencyScore } from '../analysis/productionAnalysisAxes.js'
import { computeMatchPerformanceGrade } from '../characterPerformanceGrade/compute.js'
import { applyCharacterPerformanceGrades } from '../characterPerformanceGrade/compute.js'
import { buildCharacterAggregatesFromMatches } from '../../cache/seasonAggregateBuilder.js'
import { toMatchSummaryFromPlayerMatch } from '../../cache/playerMatchStore.js'
import { uidToUserNum } from '../../external/bserMapper.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import { isGradeSupportedMode } from '../../types/matchesMode.js'
import { playedAtMs } from '../playerCharacterSnapshot/fingerprint.js'
import { resolveExclusiveTierBandFromRankTier } from './tierBand.js'
import type { ScopedRowMetrics } from './types.js'

const AXIS_LABELS: Record<string, string> = {
  survival: '생존',
  combat: '교전',
  macro: '운영',
  support: '지원',
  finish: '마무리',
  consistency: '일관성',
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function averageNullable(values: ReadonlyArray<number | null>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function median(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? null
}

export function resolvePrimaryRole(
  rows: ReadonlyArray<PlayerMatchRow>,
  characterNum?: number,
): string | null {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (characterNum != null && row.characterNum !== characterNum) continue
    const weapon = row.bestWeapon
    if (weapon == null || weapon <= 0) continue
    const role = lookupCharacterWeaponRole(row.characterNum, weapon)
    if (!role) continue
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function resolvePlayerTier(rows: ReadonlyArray<PlayerMatchRow>, displaySeasonId: number) {
  const rpValues = rows
    .map((row) => row.rpAfter)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
  if (rpValues.length === 0) return null
  const med = rpValues[Math.floor(rpValues.length / 2)] ?? rpValues[0]!
  return getRankTierFromRp(med, null, displaySeasonId)
}

function computeConsistency(rows: ReadonlyArray<PlayerMatchRow>, displaySeasonId: number): number | null {
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

function computeOverallScore(
  rows: ReadonlyArray<PlayerMatchRow>,
  displaySeasonId: number,
  apiSeasonId: number,
  characterNum?: number,
): number | null {
  const scoped = characterNum == null ? rows : rows.filter((row) => row.characterNum === characterNum)
  if (scoped.length === 0) return null
  const tier = resolvePlayerTier(scoped, displaySeasonId)
  if (!tier) return null
  const uid = scoped[0]?.uid
  if (!uid) return null
  const userNum = uidToUserNum(uid)
  const matches = scoped.map((row) => toMatchSummaryFromPlayerMatch(row, userNum))
  const stats = buildCharacterAggregatesFromMatches(matches, displaySeasonId, apiSeasonId)
  const target =
    characterNum == null
      ? stats.sort((a, b) => b.games - a.games)[0]
      : stats.find((row) => row.characterNum === characterNum)
  if (!target) return null
  const graded = applyCharacterPerformanceGrades({
    rows: [...scoped],
    characterStats: [target],
    metaStatus: 'complete',
    playerTier: tier,
  })
  const score = graded[0]?.gradeScore
  return score != null && Number.isFinite(score) ? round2(score) : null
}

export function aggregateScopedRowMetrics(params: {
  rows: ReadonlyArray<PlayerMatchRow>
  displaySeasonId: number
  apiSeasonId: number
  characterNum?: number
}): ScopedRowMetrics {
  const scoped =
    params.characterNum == null
      ? [...params.rows]
      : params.rows.filter((row) => row.characterNum === params.characterNum)
  const games = scoped.length
  const placements = scoped
    .map((row) => row.placement)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const wins = scoped.filter((row) => row.victory === true).length
  const top3 = placements.filter((value) => value <= 3).length
  const tier = resolvePlayerTier(scoped, params.displaySeasonId)
  const analysisAxes =
    scoped.length > 0 && tier
      ? buildProductionAnalysisAxesForRows({
          rows: [...scoped],
          playerTier: tier,
          displaySeasonId: params.displaySeasonId,
          scope: params.characterNum == null ? 'overall' : 'character',
        })
      : null

  const axisScores =
    analysisAxes?.axes
      .map((axis) => axis.score)
      .filter((value): value is number => value != null && Number.isFinite(value)) ?? []
  const axisOverall =
    axisScores.length >= 3 ? round2(axisScores.reduce((sum, value) => sum + value, 0) / axisScores.length) : null

  return {
    games,
    winRate: games > 0 ? round2((wins / games) * 100) : null,
    top3Rate: placements.length > 0 ? round2((top3 / placements.length) * 100) : null,
    averagePlacement: placements.length > 0 ? round2(averageNullable(placements)!) : null,
    averageKills: games > 0 ? round2(averageNullable(scoped.map((row) => row.kills)) ?? 0) : null,
    averageAssists: games > 0 ? round2(averageNullable(scoped.map((row) => row.assists)) ?? 0) : null,
    averageDeaths: games > 0 ? round2(averageNullable(scoped.map((row) => row.deaths)) ?? 0) : null,
    damagePerMinute: (() => {
      const value = averageNullable(
        scoped.map((row) => {
          if (row.damageToPlayer == null || row.gameDuration == null || row.gameDuration <= 0) return null
          return row.damageToPlayer / (row.gameDuration / 60)
        }),
      )
      return value == null ? null : round2(value)
    })(),
    visionPerMinute: (() => {
      const value = averageNullable(
        scoped.map((row) => {
          if (row.viewContribution == null || row.gameDuration == null || row.gameDuration <= 0) return null
          return row.viewContribution / (row.gameDuration / 60)
        }),
      )
      return value == null ? null : round2(value)
    })(),
    teamKillParticipation: (() => {
      const value = averageNullable(
        scoped.map((row) =>
          computeParticipationCapped({
            playerKill: row.kills,
            playerAssistant: row.assists,
            teamKill: row.teamKills,
          }),
        ),
      )
      return value == null ? null : round2(value * 100)
    })(),
    averageSurvivalTime: (() => {
      const value = averageNullable(
        scoped.map((row) =>
          row.gameDuration != null && row.gameDuration > 0 ? row.gameDuration : null,
        ),
      )
      return value == null ? null : round2(value)
    })(),
    consistencyScore: computeConsistency(scoped, params.displaySeasonId),
    overallScore:
      computeOverallScore(scoped, params.displaySeasonId, params.apiSeasonId, params.characterNum) ??
      axisOverall,
    primaryRole: resolvePrimaryRole(scoped, params.characterNum),
    tierBand: resolveExclusiveTierBandFromRankTier(tier),
    analysisAxes,
  }
}

export function sortRowsByRecency(rows: ReadonlyArray<PlayerMatchRow>): PlayerMatchRow[] {
  return [...rows].sort((a, b) => playedAtMs(b) - playedAtMs(a) || a.gameId.localeCompare(b.gameId))
}

export function buildRadarAxes(
  playerAxes: ScopedRowMetrics['analysisAxes'],
  cohortAxisMedians: Map<string, number>,
): Array<{ axis: string; label: string; playerScore: number | null; cohortMedian: number | null }> {
  return (playerAxes?.axes ?? []).map((axis) => ({
    axis: axis.axis,
    label: AXIS_LABELS[axis.axis] ?? axis.axis,
    playerScore: axis.score ?? null,
    cohortMedian: cohortAxisMedians.get(axis.axis) ?? null,
  }))
}

export function medianAxisScores(
  metricsList: ReadonlyArray<ScopedRowMetrics>,
): Map<string, number> {
  const buckets = new Map<string, number[]>()
  for (const metrics of metricsList) {
    for (const axis of metrics.analysisAxes?.axes ?? []) {
      if (axis.score == null || !Number.isFinite(axis.score)) continue
      const bucket = buckets.get(axis.axis) ?? []
      bucket.push(axis.score)
      buckets.set(axis.axis, bucket)
    }
  }
  const medians = new Map<string, number>()
  for (const [axis, values] of buckets) {
    const med = median(values)
    if (med != null) medians.set(axis, round2(med))
  }
  return medians
}

export function formatMetricValue(key: string, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (key === 'winRate' || key === 'top3Rate' || key === 'teamKillParticipation') {
    return `${value.toFixed(1)}%`
  }
  if (key === 'averagePlacement') return value.toFixed(1)
  if (key === 'averageSurvivalTime') return `${Math.round(value)}초`
  return Math.round(value).toLocaleString('ko-KR')
}
