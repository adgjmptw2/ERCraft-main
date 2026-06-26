export interface PlayerSummaryContract {
  userNum: number
  nickname: string
  level: number | null
  tier: string
  profileImageUrl?: string
  /** UI 표시 시즌 (S11 → 11). BSER API seasonID와 다름 */
  currentSeason?: number
  rp?: number | null
  leaderboardRank?: number | null
  normalizedTier?: RankTierContract
  /** DB 캐시 기준 마지막 수집/갱신 시각 */
  lastRefreshedAt?: string | null
  /** BSER 최근 경기 확인 시각 — 신규 저장과 분리 */
  lastCheckedAt?: string | null
  /** 백그라운드 최근 경기 확인 상태 */
  recentMatchCheckStatus?:
    | 'skipped-explicit-refresh'
    | 'skipped-no-profile-cache'
    | 'skipped-fresh'
    | 'skipped-cooldown'
    | 'skipped-inflight'
    | 'scheduled'
  /** PlayerMatch 등 프로필 캐시 존재 여부 */
  hasProfileCache?: boolean
  /** DB에 저장된 시즌 그리드 캐시 존재 여부 */
  hasStoredSeasonHistory?: boolean
}

export interface RankTierContract {
  tierId: string
  tierNameKo: string
  tierNameEn: string
  division: number | null
  minRp: number
  maxRp: number | null
  isLeaderboardTier: boolean
  displayLabel: string
}

export interface PlayerStatsContract {
  userNum: number
  seasonId: number
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  top3: number
  mmr: number
  characterStats?: CharacterStatContract[]
  /** current season — PlayerMatch rank 집계 (DB lightweight) */
  playerMatchCharacterStats?: SeasonCharacterAggregateContract[]
  playerMatchCharacterStatsMeta?: PlayerMatchCharacterStatsMetaContract
  overallGradeV2?: OverallGradeV2Contract | null
  overallAnalysisAxes?: ProductionAnalysisAxesContract | null
  teamPerformanceSummary?: TeamPerformanceSummaryContract
}

export type ProductionAnalysisAxisContract =
  | 'survival'
  | 'combat'
  | 'macro'
  | 'support'
  | 'finish'
  | 'consistency'

export interface ProductionAnalysisAxisComponentContract {
  metric: string
  label: string
  score: number | null
  weight: number | null
  contribution: number | null
  actualValue: number | null
  expectedValue: number | null
  ratio: number | null
}

export interface ProductionAnalysisAxisRowContract {
  axis: ProductionAnalysisAxisContract
  label: string
  score: number | null
  referenceScore: 65
  status: 'ready' | 'partial' | 'unavailable'
  sampleCount: number
  components: ProductionAnalysisAxisComponentContract[]
  description: string
}

export interface ProductionAnalysisAxesContract {
  version: string
  metricPresetVersion: string
  scope: 'overall' | 'character'
  sampleCount: number
  aggregationPolicy: string
  axes: ProductionAnalysisAxisRowContract[]
}

export interface OverallGradeV2Contract {
  overallGradeVersion: string
  overallPerformanceScore: number | null
  overallGrade: CharacterFineGrade | null
  overallScoreSource:
    | 'overall-v2-hybrid'
    | 'character-grade-weighted-average-fallback'
    | 'overall-aggregate-grade-v2'
    | 'overall-aggregate-grade-v3'
    | 'overall-aggregate-grade-v4'
  basePerformanceScore: number | null
  outcomePerformanceScore: number | null
  consistencyScore: number | null
  outcomeModifier: number
  consistencyModifier: number
  totalModifier: number
  overallConfidence: number
  overallConfidenceLabel: 'high' | 'medium' | 'low' | 'insufficient'
  weightedMatchCount: number
  gradedCharacterCount: number
  sourceFingerprint?: string
  computedAt?: string
}

/** BSER getUserStats.characterStats 항목 */
export interface CharacterStatContract {
  characterCode: number
  totalGames: number
  maxKillings?: number
  top3?: number
  wins?: number
  averageRank?: number
}

export interface MatchSummaryContract {
  matchId: string
  userNum: number
  characterNum?: number
  characterName: string
  placement: number
  kills: number
  deaths: number
  assists: number
  gameStartedAt: string
  victory: boolean
  // 프론트 MatchSummary와 동일한 optional 확장 필드
  seasonNumber?: number
  rpAfter?: number
  rpDelta?: number
  gameDuration?: number
  playerDamage?: number
  credit?: number
  teamKills?: number
  damageToPlayers?: number
  visionScore?: number
  animalKills?: number
  gameMode?: 'rank' | 'cobalt' | 'union' | 'normal'
  /** Cobalt Protocol — BSER FinalInfusion (최대 3) */
  cobaltInfusions?: number[]
  accountLevel?: number
  characterLevel?: number
  skinCode?: number
  bestWeapon?: number
  tacticalSkillGroup?: number
  traitFirstCore?: number
  traitFirstSub?: number[]
  traitSecondSub?: number[]
  equipment?: number[] | Record<string, number>
  equipmentGrade?: number[] | Record<string, number>
  routeIdOfStart?: number
  routeSlotId?: number
  gradeLabel?: string
  matchGrade?: string
  matchGradeScore?: number
  matchGradeBaselineTierKey?: string
  matchGradeRole?: CharacterGradeRole
  matchGradeUsedFallback?: boolean
  matchGradeFallback?: GradeFallbackMetadataContract
  matchGradeOutcomeScore?: number | null
  matchGradeRoleScore?: number | null
  matchGradeDamageEvidence?: {
    actualDamage: number | null
    baselineDamage: number | null
    oldExpectedDamage: number | null
    expectedDamage: number | null
    oldMultiplier: number | null
    globalMultiplier: number | null
    finalMultiplier: number | null
    damageRatio: number | null
    damageScore: number | null
    weightedContribution: number | null
    rawMetricScore?: number | null
    adjustedMetricScore?: number | null
    rawWeightedContribution?: number | null
    adjustedWeightedContribution?: number | null
    adjustmentPolicy?: string
    durationPolicy: string
    presetVersion: string
  }
  matchGradeMetricEvidence?: Array<{
    metric: string
    actualValue: number | null
    expectedValue: number | null
    ratio: number | null
    rawMetricScore: number | null
    adjustedMetricScore: number | null
    adjustmentPolicy: string
    weight: number
    rawWeightedContribution: number | null
    adjustedWeightedContribution: number | null
    metricPresetVersion: string
  }>
  teamPerformance?: TeamPerformanceContract
  roleMetrics?: {
    damageFromPlayer: number | null
    protectAbsorb: number | null
    shieldDamageOffsetFromPlayer: number | null
    teamRecover: number | null
    ccTimeToPlayer: number | null
    viewContribution: number | null
    monsterKill: number | null
    version: 1
  }
}

export interface TeamPerformanceContract {
  status: 'ready' | 'partial' | 'unavailable'
  reason?: TeamPerformanceReasonContract
  teammateCount: number
  gradedTeammateCount: number
  ownPerformanceScore: number | null
  teammatePerformanceScore: number | null
  teammatePerformanceDelta: number | null
  teammatePerformanceLabel: string | null
  carryBurdenDelta: number | null
  carryBurdenLabel: string | null
  teamMetricVersion?: string
  residualBaselineVersion?: string
  benchmarkVersion?: string
  teamLuckResidual?: number | null
  teamLuckLabel?: '최상' | '좋음' | '보통' | '나쁨' | '최악' | null
  ownResidual?: number | null
  ownRolePerformanceScore?: number | null
  expectedRolePerformanceScore?: number | null
  teammateResidualAverage?: number | null
  carryBurdenResidual?: number | null
  confidence?: 'high' | 'medium' | 'low'
  fallbackLevel?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | null
  sampleCount?: number | null
}

export type TeamPerformanceReasonContract =
  | 'missing-team-number'
  | 'missing-participants'
  | 'missing-teammates'
  | 'missing-grade-input'
  | 'partial-one-teammate'
  | 'unsupported-mode'

export interface TeamPerformanceSummaryContract {
  sampleSize: number
  readyMatches?: number
  partialMatches?: number
  unavailableMatches?: number
  averageTeammatePerformanceScore: number | null
  averageCarryBurdenDelta: number | null
  highCarryBurdenMatches: number
  lowTeammatePerformanceMatches: number
}

export interface PaginatedContract<T> {
  items: T[]
  page: number
  pageSize: number
  hasNext: boolean
}

export type SeasonAggregateCacheStatus = 'ready' | 'warming' | 'stale' | 'partial'
export type SeasonAggregateSource =
  | 'officialStats'
  | 'matchCache'
  | 'playerMatch'
  | 'mixed'
  | 'cache'

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

export type CharacterGradeRole =
  | '평타 딜러'
  | '스증 딜러'
  | '암살자'
  | '평타 브루저'
  | '스증 브루저'
  | '탱커'
  | '서포터'

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

export interface GradeFallbackMetadataContract {
  used: boolean
  baselineLevel: 'none' | 'exact' | 'tier-neighbor' | 'insufficient-baseline'
  normalization: 'none' | 'elite-anchor' | 'alternate-elite-anchor' | 'tier-only'
  combat: 'none' | 'live-metric' | 'legacy-combat' | 'blocked-exact-key' | 'fallback'
  reasons: string[]
}

export interface SeasonCharacterAggregateContract {
  characterNum: number
  characterName?: string
  games: number
  wins: number
  winRate: number
  avgRank: number | null
  kills: number
  assists: number
  deaths: number
  kda: number | null
  /** 기존 UI의 TK/K 정의: 경기당 평균 팀 킬 */
  avgTeamKills: number | null
  /** 기존 UI의 K 정의: 경기당 평균 킬 */
  avgKills: number | null
  avgDamage: number | null
  gradeLabel: string | null
  grade?: CharacterFineGrade | null
  gradeScore?: number | null
  gradeStatus?: CharacterGradeStatus
  gradeConfidence?: CharacterGradeConfidence | null
  gradeSampleSize?: number
  gradeBaselineTierKey?: string | null
  gradeRole?: CharacterGradeRole | null
  gradeUsedFallback?: boolean
  gradeFallback?: GradeFallbackMetadataContract
  gradeFallbackMetricCount?: number
  gradeRoleMetricMode?: 'legacy' | 'tank-t1' | 'tank-t2' | 'support-healer-s1' | 'support-utility-legacy' | null
  gradeRoleMetricFallbackReason?:
    | 'baseline-unavailable'
    | 'readiness-insufficient'
    | 'bootstrap-unstable'
    | 'validation-unstable'
    | 'coverage-insufficient'
    | 'sample-insufficient'
    | 'invalid-anchor'
    | 'season-mismatch'
    | 'source-disabled'
    | null
  gradeRoleMetricCoverage?: number | null
  gradeRoleMetricBaselineReadiness?: 'unusable' | 'experimental' | 'provisional' | 'ready' | null
  gradeCombatMetricMode?:
    | 'legacy-k-a-tk'
    | 'dealer-combat-c3'
    | 'assassin-combat-c3'
    | 'bruiser-combat-c3'
    | 'tank-combat-fallback'
    | 'support-healer-combat'
    | 'support-utility-combat'
    | 'role-score-v2'
    | 'role-score-v3'
    | null
  gradeCombatMetricFallbackReason?:
    | 'baseline-unavailable'
    | 'readiness-insufficient'
    | 'coverage-insufficient'
    | 'sample-insufficient'
    | 'season-mismatch'
    | 'invalid-anchor'
    | 'metric-missing'
    | 'exact-key-blocked'
    | 'preset-incomplete'
    | 'source-disabled'
    | null
  gradeCombatMetricCoverage?: number | null
  gradeCombatMetricBaselineReadiness?: 'unusable' | 'experimental' | 'provisional' | 'ready' | null
  gradeCombatPresetComplete?: boolean
  gradeCombatMissingMetrics?: string[]
  gradeCombatEffectiveWeightTotal?: number | null
  gradeAggregation?: {
    aggregationPolicy: 'plain-mean-k1' | 'robust-weighted-10pct'
    matchCount: number
    tailCount: number
    lowTailWeight: number
    highTailWeight: number
    ordinaryMean: number | null
    robustRaw: number | null
    confidence: number
    finalScore: number | null
    grade: CharacterFineGrade | null
    presetVersion: string
  }
  analysisAxes?: ProductionAnalysisAxesContract
  /** 해당 캐릭터 랭크 경기 RP 변동 합계 (PlayerMatch 집계) */
  totalRpDelta?: number | null
}

export type PlayerMatchCharacterStatsMetaStatus = 'complete' | 'partial' | 'unavailable'
export type CharacterGradeSnapshotStatus =
  | 'ready'
  | 'stale'
  | 'refreshing'
  | 'unavailable'
  | 'insufficient-data'

export interface PlayerMatchCharacterStatsMetaContract {
  status: PlayerMatchCharacterStatsMetaStatus
  snapshotStatus?: CharacterGradeSnapshotStatus
  userNum: number
  seasonId: number
  generatedAt: string
  rowCount: number
  matchCount: number
  benchmarkVersion?: string
  metricPresetVersion?: string
  sourceFingerprint?: string
  computedAt?: string
  reason?: string
  sourceCount?: number
  rawMatchCount?: number
  deduplicatedMatchCount?: number
  overallGradeVersion?: string
  /** 등급 산출에 사용한 플레이어 기준 티어 키 (스냅샷 무효화용) */
  gradePlayerTierKey?: string | null
}

export interface RpSeriesPointContract {
  matchId?: string
  dateLabel: string
  rpAfter: number
  rpDelta?: number | null
  dayMinRp?: number
  dayMaxRp?: number
  gamesPlayed?: number
}

export interface SeasonAggregateCoverageContract {
  officialSeasonGames: number | null
  collectedGames: number | null
  characterCount: number
  rpPointCount: number
  coverageRatio: number | null
}

export type SeasonAggregateBackfillStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'partial'
  | 'failed'
  | 'cooldown'

export interface SeasonAggregateBackfillProgressContract {
  status: SeasonAggregateBackfillStatus
  officialSeasonGames: number | null
  collectedGames: number
  stoppedReason?: string
}

export interface PlayerSeasonAggregateContract {
  userNum: number
  seasonId: number
  apiSeasonId: number
  cacheStatus: SeasonAggregateCacheStatus
  source?: SeasonAggregateSource
  basisLabel?: string
  isRefreshing?: boolean
  backfillProgress?: SeasonAggregateBackfillProgressContract
  characterStats: SeasonCharacterAggregateContract[]
  rpSeries: RpSeriesPointContract[]
  coverage?: SeasonAggregateCoverageContract
  lastRefreshedAt: string
}
