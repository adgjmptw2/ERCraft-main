export type MatchGradeRuntimeVersion = 'v2-percentile' | 'v3-direct'
export type TeamPerformanceRuntimeVersion = 'v2-residual' | 'v3-direct'
export type AggregateGradeRuntimeVersion =
  | 'v1-character-shrink'
  | 'v2-k5-calibrated'
  | 'v3-shared-fine-cuts'
  | 'v4-shared-fine-cuts-k1'

export const MATCH_GRADE_RUNTIME_VERSION: MatchGradeRuntimeVersion = 'v3-direct'
export const TEAM_PERFORMANCE_RUNTIME_VERSION: TeamPerformanceRuntimeVersion = 'v3-direct'
export const AGGREGATE_GRADE_RUNTIME_VERSION: AggregateGradeRuntimeVersion = 'v4-shared-fine-cuts-k1'
