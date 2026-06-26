export const PLAYER_CHARACTER_SNAPSHOT_BENCHMARK_VERSION = 'player-character-shadow.v1' as const
export const PLAYER_ANALYSIS_BENCHMARK_VERSION = 'player-analysis-benchmark.v2' as const

export const BENCHMARK_SCOPES = ['rank', 'normal', 'all'] as const
export type PlayerCharacterBenchmarkScope = (typeof BENCHMARK_SCOPES)[number]

export const SAMPLE_STATUS = ['exploratory', 'provisional', 'benchmarkEligible'] as const
export type PlayerCharacterSampleStatus = (typeof SAMPLE_STATUS)[number]

export const EXPLORATORY_MIN_MATCHES = 3
export const PROVISIONAL_MIN_MATCHES = 10
export const BENCHMARK_ELIGIBLE_MIN_MATCHES = 20

export const COHORT_PERCENTILE_THRESHOLDS = {
  disabledBelow: 30,
  tercileMax: 49,
  decileMax: 99,
  fullPercentMax: 299,
} as const

export const SHADOW_GRADE_BANDS = [
  { grade: 'S+', minPercentile: 99, maxPercentile: 100 },
  { grade: 'S', minPercentile: 95, maxPercentile: 99 },
  { grade: 'S-', minPercentile: 90, maxPercentile: 95 },
  { grade: 'A+', minPercentile: 82, maxPercentile: 90 },
  { grade: 'A', minPercentile: 72, maxPercentile: 82 },
  { grade: 'A-', minPercentile: 60, maxPercentile: 72 },
  { grade: 'B+', minPercentile: 48, maxPercentile: 60 },
  { grade: 'B', minPercentile: 36, maxPercentile: 48 },
  { grade: 'B-', minPercentile: 26, maxPercentile: 36 },
  { grade: 'C+', minPercentile: 18, maxPercentile: 26 },
  { grade: 'C', minPercentile: 12, maxPercentile: 18 },
  { grade: 'C-', minPercentile: 7, maxPercentile: 12 },
  { grade: 'D+', minPercentile: 4, maxPercentile: 7 },
  { grade: 'D', minPercentile: 2, maxPercentile: 4 },
  { grade: 'D-', minPercentile: 0, maxPercentile: 2 },
] as const

export const SHADOW_PERCENTILE_POINTS = [
  0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99,
] as const

export const SHADOW_AUDIT_METRICS = [
  'shadowScore',
  'damagePerMinute',
  'damageShare',
  'visionPerMinute',
  'teamKillParticipation',
  'averagePlacement',
  'winRate',
  'consistencyScore',
] as const

export type ShadowAuditMetricKey = (typeof SHADOW_AUDIT_METRICS)[number]
