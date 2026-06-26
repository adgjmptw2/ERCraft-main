import type { CharacterGradeRole } from '../characterPerformanceGrade/config.js'

export const TEAM_LUCK_ROLE_SCORE_VERSION = 'role-score.v2'

export const TEAM_LUCK_ROLE_SCORE_WEIGHTS: Record<
  CharacterGradeRole,
  {
    damage: number
    combatContribution: number
    survival: number
    vision: number
    monster: number
  }
> = {
  '평타 딜러': { damage: 32, combatContribution: 24, survival: 10, vision: 18, monster: 16 },
  '스증 딜러': { damage: 36, combatContribution: 25, survival: 10, vision: 18, monster: 11 },
  암살자: { damage: 30, combatContribution: 32, survival: 10, vision: 18, monster: 10 },
  '평타 브루저': { damage: 27, combatContribution: 28, survival: 15, vision: 17, monster: 13 },
  '스증 브루저': { damage: 30, combatContribution: 29, survival: 15, vision: 17, monster: 9 },
  탱커: { damage: 12, combatContribution: 35, survival: 20, vision: 30, monster: 3 },
  서포터: { damage: 7, combatContribution: 38, survival: 20, vision: 33, monster: 2 },
}

export type TeamLuckRoleScoreMetric = keyof (typeof TEAM_LUCK_ROLE_SCORE_WEIGHTS)['평타 딜러']

export interface TeamKillParticipantRow {
  gameId: string
  teamNumber: number | null
  teamKill: number | null
  playerKill?: number | null
  playerAssistant?: number | null
}

export interface TeamKillMeaningReport {
  teamGroupCount: number
  sameTeamUniformCount: number
  sameTeamUniformRatio: number
  differentTeamComparableMatchCount: number
  differentTeamDifferentCount: number
  differentTeamDifferentRatio: number
  equalsKillAssistCount: number
  participantCount: number
  equalsKillAssistRatio: number
}

export interface TeamLuckRoleMetricInput {
  role: CharacterGradeRole
  damageToPlayer: number | null
  damageToPlayerPerMinute: number | null
  combatContribution: number | null
  deathsPer10m: number | null
  visionScore: number | null
  visionScorePerMinute: number | null
  monsterKill: number | null
  monsterKillPerMinute: number | null
}

export interface TeamLuckRoleMetricBaseline {
  damageToPlayer: number | null
  damageToPlayerPerMinute: number | null
  combatContribution: number | null
  deathsPer10m: number | null
  visionScore: number | null
  visionScorePerMinute: number | null
  monsterKill: number | null
  monsterKillPerMinute: number | null
}

export interface TeamLuckRoleScoreResult {
  score: number | null
  effectiveWeight: number
  metricScores: Partial<Record<TeamLuckRoleScoreMetric, number>>
  missingMetrics: TeamLuckRoleScoreMetric[]
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function safeRatio(value: number | null, baseline: number | null, higherBetter: boolean): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(baseline)) return null
  if (Math.abs(baseline) < 1e-6) return value === baseline ? 65 : null
  const relative = higherBetter ? (value - baseline) / Math.abs(baseline) : (baseline - value) / Math.abs(baseline)
  return Math.max(20, Math.min(100, 65 + relative * 45))
}

function weightedAverage(entries: Array<{ score: number | null; weight: number }>): {
  score: number | null
  effectiveWeight: number
} {
  let weighted = 0
  let effectiveWeight = 0
  for (const entry of entries) {
    if (entry.score == null || !Number.isFinite(entry.score) || entry.weight <= 0) continue
    weighted += entry.score * entry.weight
    effectiveWeight += entry.weight
  }
  return {
    score: effectiveWeight > 0 ? round(weighted / effectiveWeight, 4) : null,
    effectiveWeight,
  }
}

function mixedTotalMinuteScore(params: {
  total: number | null
  perMinute: number | null
  baselineTotal: number | null
  baselinePerMinute: number | null
  totalWeight: number
}): number | null {
  const totalScore = safeRatio(params.total, params.baselineTotal, true)
  const minuteScore = safeRatio(params.perMinute, params.baselinePerMinute, true)
  const minuteWeight = 1 - params.totalWeight
  return weightedAverage([
    { score: totalScore, weight: params.totalWeight },
    { score: minuteScore, weight: minuteWeight },
  ]).score
}

export function sumTeamLuckRoleWeights(role: CharacterGradeRole): number {
  return Object.values(TEAM_LUCK_ROLE_SCORE_WEIGHTS[role]).reduce((sum, weight) => sum + weight, 0)
}

export function computeCombatContributionRatio(params: {
  playerKill: number | null
  playerAssistant: number | null
  teamKill: number | null
}): number | null {
  const { playerKill, playerAssistant, teamKill } = params
  if (!isFiniteNumber(playerKill) || !isFiniteNumber(playerAssistant) || !isFiniteNumber(teamKill)) return null
  if (teamKill <= 0) return null
  return round(Math.min((playerKill + playerAssistant * 0.7) / teamKill, 1), 6)
}

export function deathsPer10m(deaths: number | null, durationSeconds: number | null): number | null {
  if (!isFiniteNumber(deaths) || !isFiniteNumber(durationSeconds) || durationSeconds <= 0) return null
  return round(deaths / (durationSeconds / 600), 6)
}

export function perMinute(value: number | null, durationSeconds: number | null): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(durationSeconds) || durationSeconds <= 0) return null
  return round(value / (durationSeconds / 60), 6)
}

export function durationBucket(seconds: number | null | undefined): string {
  if (!isFiniteNumber(seconds) || seconds <= 0) return 'unknown-duration'
  const minutes = seconds / 60
  if (minutes < 15) return 'duration-lt-15m'
  if (minutes < 20) return 'duration-15-20m'
  if (minutes < 25) return 'duration-20-25m'
  if (minutes < 30) return 'duration-25-30m'
  return 'duration-30m-plus'
}

export function placementBucket(placement: number | null | undefined): string {
  if (!isFiniteNumber(placement) || placement <= 0) return 'unknown-place'
  if (placement === 1) return 'place-1'
  if (placement <= 3) return 'place-2-3'
  if (placement <= 6) return 'place-4-6'
  return 'place-7-plus'
}

export function computeTeamLuckRoleScore(
  input: TeamLuckRoleMetricInput,
  baseline: TeamLuckRoleMetricBaseline,
): TeamLuckRoleScoreResult {
  const weights = TEAM_LUCK_ROLE_SCORE_WEIGHTS[input.role]
  const metricScores: Partial<Record<TeamLuckRoleScoreMetric, number>> = {
    damage: mixedTotalMinuteScore({
      total: input.damageToPlayer,
      perMinute: input.damageToPlayerPerMinute,
      baselineTotal: baseline.damageToPlayer,
      baselinePerMinute: baseline.damageToPlayerPerMinute,
      totalWeight: 0.65,
    }) ?? undefined,
    combatContribution: safeRatio(input.combatContribution, baseline.combatContribution, true) ?? undefined,
    survival: safeRatio(input.deathsPer10m, baseline.deathsPer10m, false) ?? undefined,
    vision: mixedTotalMinuteScore({
      total: input.visionScore,
      perMinute: input.visionScorePerMinute,
      baselineTotal: baseline.visionScore,
      baselinePerMinute: baseline.visionScorePerMinute,
      totalWeight: 0.65,
    }) ?? undefined,
    monster: mixedTotalMinuteScore({
      total: input.monsterKill,
      perMinute: input.monsterKillPerMinute,
      baselineTotal: baseline.monsterKill,
      baselinePerMinute: baseline.monsterKillPerMinute,
      totalWeight: 0.7,
    }) ?? undefined,
  }
  const missingMetrics = (Object.keys(weights) as TeamLuckRoleScoreMetric[]).filter(
    (metric) => metricScores[metric] == null,
  )
  const result = weightedAverage(
    (Object.keys(weights) as TeamLuckRoleScoreMetric[]).map((metric) => ({
      score: metricScores[metric] ?? null,
      weight: weights[metric],
    })),
  )
  return {
    score: result.score,
    effectiveWeight: result.effectiveWeight,
    metricScores,
    missingMetrics,
  }
}

export function analyzeTeamKillMeaning(rows: ReadonlyArray<TeamKillParticipantRow>): TeamKillMeaningReport {
  const teamGroups = new Map<string, TeamKillParticipantRow[]>()
  const matchGroups = new Map<string, TeamKillParticipantRow[]>()
  let equalsKillAssistCount = 0
  let participantCount = 0

  for (const row of rows) {
    if (row.teamNumber == null || row.teamKill == null) continue
    const teamKey = `${row.gameId}|${row.teamNumber}`
    teamGroups.set(teamKey, [...(teamGroups.get(teamKey) ?? []), row])
    matchGroups.set(row.gameId, [...(matchGroups.get(row.gameId) ?? []), row])
    if (row.playerKill != null && row.playerAssistant != null) {
      participantCount += 1
      if (row.teamKill === row.playerKill + row.playerAssistant) equalsKillAssistCount += 1
    }
  }

  let sameTeamUniformCount = 0
  for (const group of teamGroups.values()) {
    const values = new Set(group.map((row) => row.teamKill))
    if (values.size === 1) sameTeamUniformCount += 1
  }

  let differentTeamComparableMatchCount = 0
  let differentTeamDifferentCount = 0
  for (const group of matchGroups.values()) {
    const teamValues = new Map<number, number>()
    for (const row of group) {
      if (row.teamNumber == null || row.teamKill == null) continue
      if (!teamValues.has(row.teamNumber)) teamValues.set(row.teamNumber, row.teamKill)
    }
    if (teamValues.size < 2) continue
    differentTeamComparableMatchCount += 1
    if (new Set(teamValues.values()).size > 1) differentTeamDifferentCount += 1
  }

  return {
    teamGroupCount: teamGroups.size,
    sameTeamUniformCount,
    sameTeamUniformRatio: teamGroups.size > 0 ? round(sameTeamUniformCount / teamGroups.size) : 0,
    differentTeamComparableMatchCount,
    differentTeamDifferentCount,
    differentTeamDifferentRatio:
      differentTeamComparableMatchCount > 0
        ? round(differentTeamDifferentCount / differentTeamComparableMatchCount)
        : 0,
    equalsKillAssistCount,
    participantCount,
    equalsKillAssistRatio: participantCount > 0 ? round(equalsKillAssistCount / participantCount) : 0,
  }
}
