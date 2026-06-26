export type CharacterGradeRole =
  | '평타 딜러'
  | '스증 딜러'
  | '암살자'
  | '평타 브루저'
  | '스증 브루저'
  | '탱커'
  | '서포터'

export type CharacterFineGrade =
  | 'S+'
  | 'S'
  | 'S-'
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'D-'

export type CharacterGradeStatus =
  | 'ok'
  | 'insufficient-sample'
  | 'partial-data'
  | 'missing-baseline'

export type CharacterGradeConfidence =
  | 'insufficient'
  | 'provisional'
  | 'low'
  | 'medium'
  | 'high'

export const GRADE_BASELINE_TIER_KEYS = [
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
] as const

export type GradeBaselineTierKey = (typeof GRADE_BASELINE_TIER_KEYS)[number]

export const ELITE_BASELINE_TIER_KEY: GradeBaselineTierKey = 'in1000'
export const ELITE_FALLBACK_BASELINE_TIER_KEY: GradeBaselineTierKey = 'mithril_plus'
export const MIN_BASELINE_SAMPLE_GAMES = 30
export const MIN_GRADE_SAMPLE_GAMES = 5
export const NORMALIZATION_EPSILON = 1e-6
export const ELITE_GAP_MIN_FRACTION_OF_TIER_ONLY_TARGET = 0.2
export const CHARACTER_GRADE_BENCHMARK_VERSION = 'tier-baselines.v1-fixed-legacy.v1'
export const CHARACTER_GRADE_METRIC_PRESET_VERSION = 'dtg-v1+asym-v1+charrobust10-v1+overallraw-v1'
export const MATCH_GRADE_S_ROLE_SCORE_GATE = 84
export const MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE = 96
export const MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE = 88

export const TIER_ONLY_TARGET_RELATIVE_GAIN = {
  winRate: 0.3,
  top3Rate: 0.2,
  averagePlace: 0.15,
  averagePlayerKill: 0.3,
  averagePlayerAssistant: 0.2,
  averageTeamKill: 0.15,
  averageDamageToPlayer: 0.25,
  averageDeaths: 0.2,
  averageViewContribution: 0.25,
  averageMonsterKill: 0.2,
} as const

export type TierOnlyTargetMetricKey = keyof typeof TIER_ONLY_TARGET_RELATIVE_GAIN

export const OUTCOME_SCORE_WEIGHT = 0.45
export const ROLE_SCORE_WEIGHT = 0.55

export const OUTCOME_METRIC_WEIGHTS = {
  winRate: 30,
  top3Rate: 30,
  averagePlace: 40,
} as const

export type RoleMetricKey =
  | 'damageToPlayer'
  | 'playerKill'
  | 'teamKill'
  | 'playerAssistant'
  | 'survival'
  | 'viewContribution'
  | 'monsterKill'

export const ROLE_PRESET_WEIGHTS: Record<CharacterGradeRole, Record<RoleMetricKey, number>> = {
  '평타 딜러': {
    damageToPlayer: 27,
    playerKill: 17,
    teamKill: 15,
    playerAssistant: 8,
    survival: 10,
    viewContribution: 9,
    monsterKill: 14,
  },
  '스증 딜러': {
    damageToPlayer: 30,
    playerKill: 16,
    teamKill: 16,
    playerAssistant: 10,
    survival: 10,
    viewContribution: 9,
    monsterKill: 9,
  },
  암살자: {
    damageToPlayer: 21,
    playerKill: 23,
    teamKill: 18,
    playerAssistant: 7,
    survival: 13,
    viewContribution: 8,
    monsterKill: 10,
  },
  '평타 브루저': {
    damageToPlayer: 20,
    playerKill: 12,
    teamKill: 18,
    playerAssistant: 10,
    survival: 18,
    viewContribution: 10,
    monsterKill: 12,
  },
  '스증 브루저': {
    damageToPlayer: 22,
    playerKill: 10,
    teamKill: 19,
    playerAssistant: 12,
    survival: 18,
    viewContribution: 10,
    monsterKill: 9,
  },
  탱커: {
    damageToPlayer: 8,
    playerKill: 4,
    teamKill: 21,
    playerAssistant: 19,
    survival: 26,
    viewContribution: 15,
    monsterKill: 7,
  },
  서포터: {
    damageToPlayer: 5,
    playerKill: 3,
    teamKill: 22,
    playerAssistant: 28,
    survival: 19,
    viewContribution: 20,
    monsterKill: 3,
  },
}

export const FINE_GRADE_CUTS: ReadonlyArray<{ min: number; grade: CharacterFineGrade }> = [
  { min: 95, grade: 'S+' },
  { min: 88, grade: 'S' },
  { min: 84, grade: 'S-' },
  { min: 80, grade: 'A+' },
  { min: 76, grade: 'A' },
  { min: 72, grade: 'A-' },
  { min: 68, grade: 'B+' },
  { min: 62, grade: 'B' },
  { min: 56, grade: 'B-' },
  { min: 50, grade: 'C+' },
  { min: 44, grade: 'C' },
  { min: 38, grade: 'C-' },
  { min: 32, grade: 'D+' },
  { min: 24, grade: 'D' },
  { min: Number.NEGATIVE_INFINITY, grade: 'D-' },
]

export function sumRoleWeights(role: CharacterGradeRole): number {
  return Object.values(ROLE_PRESET_WEIGHTS[role]).reduce((sum, weight) => sum + weight, 0)
}

export function scoreToFineGrade(score: number): CharacterFineGrade {
  for (const cut of FINE_GRADE_CUTS) {
    if (score >= cut.min) return cut.grade
  }
  return 'D-'
}

export function resolveGradeConfidence(sampleSize: number): CharacterGradeConfidence {
  if (sampleSize < 5) return 'insufficient'
  if (sampleSize < 10) return 'provisional'
  if (sampleSize < 20) return 'low'
  if (sampleSize < 40) return 'medium'
  return 'high'
}

export function applySampleConfidence(rawScore: number, sampleSize: number): number {
  const confidence = sampleConfidenceFactor(sampleSize)
  return 65 + (rawScore - 65) * confidence
}

export function sampleConfidenceFactor(sampleSize: number): number {
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return 0
  if (sampleSize >= 20) return 1
  return sampleSize / (sampleSize + 1)
}
