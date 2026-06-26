import type { MatchHistoryMode } from '@/types/matchMode'

export interface PlayerSummary {
  userNum: number
  nickname: string
  level: number | null
  tier: string
  profileImageUrl?: string
  /** real API — UI 표시 시즌 (S11 → 11) */
  currentSeason?: number
  rp?: number | null
  leaderboardRank?: number | null
  normalizedTier?: NormalizedRankTier
  /** DB 캐시 기준 마지막 수집/갱신 시각 */
  lastRefreshedAt?: string | null
  /** BSER 최근 경기 확인 시각 */
  lastCheckedAt?: string | null
  recentMatchCheckStatus?:
    | 'skipped-explicit-refresh'
    | 'skipped-no-profile-cache'
    | 'skipped-fresh'
    | 'skipped-cooldown'
    | 'skipped-inflight'
    | 'scheduled'
  /** 프로필 캐시 존재 — false면 최초 수집 허용 */
  hasProfileCache?: boolean
  /** DB에 저장된 시즌 기록 존재 */
  hasStoredSeasonHistory?: boolean
}

export interface NormalizedRankTier {
  tierId: string
  tierNameKo: string
  tierNameEn: string
  division: number | null
  minRp: number
  maxRp: number | null
  isLeaderboardTier: boolean
  displayLabel: string
}

/** 프로필 API 요청 — 검색에서 선택한 userNum/uid 우선 */
export interface PlayerFetchOptions {
  userNum?: number
  uid?: string
  seasonId?: number
  matchMode?: MatchHistoryMode
  /** 명시적 전적 갱신 — true일 때만 upstream 최신 확인 */
  refresh?: boolean
  signal?: AbortSignal
}

export interface PlayerCharacterStat {
  characterCode: number
  totalGames: number
  maxKillings?: number
  top3?: number
  wins?: number
  averageRank?: number
}

export interface PlayerStats {
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
  characterStats?: PlayerCharacterStat[]
  playerMatchCharacterStats?: SeasonCharacterAggregateDTO[]
  playerMatchCharacterStatsMeta?: PlayerMatchCharacterStatsMetaDTO
  overallGradeV2?: OverallGradeV2DTO | null
  overallAnalysisAxes?: ProductionAnalysisAxesDTO | null
  teamPerformanceSummary?: TeamPerformanceSummaryDTO
}

export type ProductionAnalysisAxisDTO =
  | 'survival'
  | 'combat'
  | 'macro'
  | 'support'
  | 'finish'
  | 'consistency'

export interface ProductionAnalysisAxisComponentDTO {
  metric: string
  label: string
  score: number | null
  weight: number | null
  contribution: number | null
  actualValue: number | null
  expectedValue: number | null
  ratio: number | null
}

export interface ProductionAnalysisAxisRowDTO {
  axis: ProductionAnalysisAxisDTO
  label: string
  score: number | null
  referenceScore: 65
  status: 'ready' | 'partial' | 'unavailable'
  sampleCount: number
  components: ProductionAnalysisAxisComponentDTO[]
  description: string
}

export interface ProductionAnalysisAxesDTO {
  version: string
  metricPresetVersion: string
  scope: 'overall' | 'character'
  sampleCount: number
  aggregationPolicy: string
  axes: ProductionAnalysisAxisRowDTO[]
}

export interface TeamPerformanceSummaryDTO {
  sampleSize: number
  readyMatches?: number
  partialMatches?: number
  unavailableMatches?: number
  averageTeammatePerformanceScore: number | null
  averageCarryBurdenDelta: number | null
  highCarryBurdenMatches: number
  lowTeammatePerformanceMatches: number
}

export interface OverallGradeV2DTO {
  overallGradeVersion: string
  overallPerformanceScore: number | null
  overallGrade: import('@/utils/characterGrade').CharacterFineGrade | null
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

export interface PlayerRanking {
  userNum: number
  rank: number
  tier: string
  lp: number
}

export interface NicknameHistoryEntry {
  nickname: string
  changedAt: string
}

export type NicknameHistory = NicknameHistoryEntry[]

export interface PlayerStatsDTO {
  userNum?: number
  seasonId?: number
  games: number
  winRate: number
  avgKills: number
  avgPlacement: number
  kda: number
  kdaString: string
  mostPlayedCharacter: { name: string; count: number }
  tier: string
  mmr: number
  characterStats?: PlayerCharacterStat[]
  playerMatchCharacterStats?: SeasonCharacterAggregateDTO[]
  playerMatchCharacterStatsMeta?: PlayerMatchCharacterStatsMetaDTO
  overallGradeV2?: OverallGradeV2DTO | null
  overallAnalysisAxes?: ProductionAnalysisAxesDTO | null
  teamPerformanceSummary?: TeamPerformanceSummaryDTO
}

export type SeasonAggregateCacheStatus = 'ready' | 'warming' | 'stale' | 'partial'
export type SeasonAggregateSource = 'officialStats' | 'matchCache' | 'mixed' | 'cache'

export interface SeasonCharacterAggregateDTO {
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
  avgTeamKills: number | null
  avgKills: number | null
  avgDamage: number | null
  gradeLabel: string | null
  grade?: import('@/utils/characterGrade').CharacterFineGrade | null
  gradeScore?: number | null
  gradeStatus?:
    | 'ok'
    | 'insufficient-sample'
    | 'partial-data'
    | 'missing-baseline'
  gradeConfidence?: 'insufficient' | 'provisional' | 'low' | 'medium' | 'high' | null
  gradeSampleSize?: number
  gradeBaselineTierKey?: string | null
  gradeRole?: string | null
  gradeUsedFallback?: boolean
  gradeFallback?: {
    used: boolean
    baselineLevel: string
    normalization: string
    combat: string
    reasons: string[]
  }
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
    grade: import('@/utils/characterGrade').CharacterFineGrade | null
    presetVersion: string
  }
  analysisAxes?: ProductionAnalysisAxesDTO
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

export interface PlayerMatchCharacterStatsMetaDTO {
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
}

export interface RpSeriesPointDTO {
  matchId?: string
  dateLabel: string
  rpAfter: number
  rpDelta?: number | null
  dayMinRp?: number
  dayMaxRp?: number
  gamesPlayed?: number
}

export interface SeasonAggregateCoverageDTO {
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

export interface SeasonAggregateBackfillProgressDTO {
  status: SeasonAggregateBackfillStatus
  officialSeasonGames: number | null
  collectedGames: number
  stoppedReason?: string
}

export interface PlayerSeasonAggregateDTO {
  userNum: number
  seasonId: number
  apiSeasonId: number
  cacheStatus: SeasonAggregateCacheStatus
  source?: SeasonAggregateSource
  basisLabel?: string
  isRefreshing?: boolean
  backfillProgress?: SeasonAggregateBackfillProgressDTO
  characterStats: SeasonCharacterAggregateDTO[]
  rpSeries: RpSeriesPointDTO[]
  coverage?: SeasonAggregateCoverageDTO
  lastRefreshedAt: string
}
