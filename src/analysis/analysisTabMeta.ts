import type { AnalysisDataConfidence } from '@/analysis/metricTypes'
import {
  isAggregateIncomplete,
  type ProfileCharacterStatsSource,
} from '@/analysis/profileCharacterStatsPriority'
import type { PlayerSeasonAggregateDTO, PlayerStatsDTO } from '@/types/player'

export const ANALYSIS_SOURCE_COMPLETE = '시즌 전체 랭크 경기 기준'
export const ANALYSIS_SOURCE_PARTIAL = '수집된 경기 기준 · 백그라운드 보강 중'
export const ANALYSIS_SOURCE_OFFICIAL_MERGE = '공식 시즌 통계 + 수집 경기 병합 기준'
export const ANALYSIS_SOURCE_OFFICIAL = '공식 시즌 통계 기준'
/** @deprecated 시즌·최근 경향 분리 이후 trend 쪽 라벨 사용 */
export const ANALYSIS_SOURCE_MATCHES = '최근 경기 표본 기준'
export const ANALYSIS_SOURCE_NONE = '분석 가능한 데이터 부족'
export const ANALYSIS_SEASON_NONE = '분석 가능한 시즌 데이터 부족'
export const ANALYSIS_TREND_INSUFFICIENT = '최근 경기 표본 부족'

export const ANALYSIS_CONFIDENCE_HIGH_MIN = 100
export const ANALYSIS_CONFIDENCE_MEDIUM_MIN = 30
export const ANALYSIS_CONFIDENCE_LOW_MIN = 10

const MIN_MATCHES_SAMPLE = 3

export interface AnalysisTabMeta {
  /** 시즌 aggregate/stats 기준 — 39.10A 호환 */
  sourceLabel: string
  sampleLabel: string
  sampleSize: number
  confidenceLevel: AnalysisDataConfidence
  confidenceLabel: string
  isPartial: boolean
  isComplete: boolean
  isBackfilling: boolean
  usedRankGames: number
  usedRecentMatches: number
  /** 시즌 데이터 범위 */
  seasonSourceLabel: string
  seasonSampleLabel: string
  seasonSampleCount: number
  seasonConfidenceLabel: string
  /** 로드된 recent matches 기반 플레이 경향 */
  trendBasisLabel: string
  trendSampleCount: number
  /** 시즌·경향 기준이 다를 때 짧은 안내 */
  scopeNote: string | null
}

export interface BuildAnalysisTabMetaParams {
  seasonAggregate: PlayerSeasonAggregateDTO | null
  statsDto: PlayerStatsDTO | null
  recentMatchCount: number
  characterStatsSource: ProfileCharacterStatsSource
  preferOfficialStatsDespitePartial?: boolean
}

function getCollectedGames(aggregate: PlayerSeasonAggregateDTO): number {
  const fromCoverage = aggregate.coverage?.collectedGames
  if (fromCoverage != null && fromCoverage > 0) return fromCoverage
  const fromBackfill = aggregate.backfillProgress?.collectedGames
  if (fromBackfill != null && fromBackfill > 0) return fromBackfill
  return aggregate.characterStats.reduce((sum, row) => sum + row.games, 0)
}

function getOfficialSeasonGames(aggregate: PlayerSeasonAggregateDTO): number | null {
  return (
    aggregate.coverage?.officialSeasonGames ??
    aggregate.backfillProgress?.officialSeasonGames ??
    null
  )
}

export function isSeasonAggregateComplete(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
): boolean {
  if (!aggregate) return false
  if (aggregate.backfillProgress?.status === 'complete') return true
  const official = getOfficialSeasonGames(aggregate)
  const collected = getCollectedGames(aggregate)
  return official != null && official > 0 && collected >= official
}

function resolveConfidenceLevel(
  sampleSize: number,
  isComplete: boolean,
): AnalysisDataConfidence {
  if (sampleSize < ANALYSIS_CONFIDENCE_LOW_MIN) return 'insufficient'
  if (isComplete && sampleSize >= ANALYSIS_CONFIDENCE_MEDIUM_MIN) return 'high'
  if (sampleSize >= ANALYSIS_CONFIDENCE_HIGH_MIN) return 'high'
  if (sampleSize >= ANALYSIS_CONFIDENCE_MEDIUM_MIN) return 'medium'
  return 'low'
}

function resolveConfidenceLabel(
  level: AnalysisDataConfidence,
  isBackfilling: boolean,
): string {
  if (isBackfilling) return '보강 중'
  switch (level) {
    case 'high':
      return '신뢰도 높음'
    case 'medium':
      return '신뢰도 보통'
    case 'low':
      return '신뢰도 낮음'
    case 'insufficient':
      return '표본 부족'
  }
}

function formatSampleLabel(sampleSize: number): string {
  if (sampleSize <= 0) return '표본 부족'
  return `표본 ${sampleSize}전`
}

function formatTrendBasisLabel(recentMatchCount: number): string {
  if (recentMatchCount >= MIN_MATCHES_SAMPLE) {
    return `최근 ${recentMatchCount}경기 기준`
  }
  if (recentMatchCount > 0) {
    return `최근 ${recentMatchCount}경기 기준`
  }
  return ANALYSIS_TREND_INSUFFICIENT
}

interface SeasonScope {
  seasonSourceLabel: string
  seasonSampleCount: number
  isComplete: boolean
  isPartial: boolean
  isBackfilling: boolean
}

function resolveSeasonScope(params: BuildAnalysisTabMetaParams): SeasonScope {
  const {
    seasonAggregate,
    statsDto,
    characterStatsSource,
    preferOfficialStatsDespitePartial = false,
  } = params

  const collectedGames = seasonAggregate ? getCollectedGames(seasonAggregate) : 0
  const officialStatsGames = statsDto?.games ?? 0
  const isComplete = isSeasonAggregateComplete(seasonAggregate)
  const hasAggregate = seasonAggregate != null && collectedGames > 0
  const aggregatePartial =
    hasAggregate && !isComplete && isAggregateIncomplete(seasonAggregate)
  const isBackfilling =
    aggregatePartial &&
    (seasonAggregate?.isRefreshing === true ||
      seasonAggregate?.backfillProgress?.status === 'running' ||
      seasonAggregate?.cacheStatus === 'partial' ||
      seasonAggregate?.cacheStatus === 'warming')

  if (isComplete) {
    return {
      seasonSourceLabel: ANALYSIS_SOURCE_COMPLETE,
      seasonSampleCount: collectedGames,
      isComplete: true,
      isPartial: false,
      isBackfilling: false,
    }
  }

  if (aggregatePartial) {
    const seasonSourceLabel =
      preferOfficialStatsDespitePartial && officialStatsGames > 0
        ? ANALYSIS_SOURCE_OFFICIAL_MERGE
        : ANALYSIS_SOURCE_PARTIAL
    return {
      seasonSourceLabel,
      seasonSampleCount: collectedGames,
      isComplete: false,
      isPartial: true,
      isBackfilling,
    }
  }

  if (characterStatsSource === 'official-stats' && officialStatsGames > 0) {
    return {
      seasonSourceLabel: ANALYSIS_SOURCE_OFFICIAL,
      seasonSampleCount: officialStatsGames,
      isComplete: false,
      isPartial: false,
      isBackfilling: false,
    }
  }

  if (officialStatsGames >= ANALYSIS_CONFIDENCE_LOW_MIN) {
    return {
      seasonSourceLabel: ANALYSIS_SOURCE_OFFICIAL,
      seasonSampleCount: officialStatsGames,
      isComplete: false,
      isPartial: false,
      isBackfilling: false,
    }
  }

  return {
    seasonSourceLabel: ANALYSIS_SEASON_NONE,
    seasonSampleCount: 0,
    isComplete: false,
    isPartial: false,
    isBackfilling: false,
  }
}

function resolveScopeNote(
  season: SeasonScope,
  trendSampleCount: number,
): string | null {
  const hasSeason = season.seasonSampleCount > 0
  const hasTrend = trendSampleCount >= MIN_MATCHES_SAMPLE

  if (season.isBackfilling && hasTrend) {
    return '시즌 데이터는 보강 중'
  }
  if (!hasSeason && !hasTrend) {
    return ANALYSIS_SOURCE_NONE
  }
  return null
}

export function buildAnalysisTabMeta(params: BuildAnalysisTabMetaParams): AnalysisTabMeta {
  const { recentMatchCount } = params
  const season = resolveSeasonScope(params)
  const trendBasisLabel = formatTrendBasisLabel(recentMatchCount)
  const trendSampleCount = recentMatchCount
  const confidenceLevel = resolveConfidenceLevel(season.seasonSampleCount, season.isComplete)
  const seasonConfidenceLabel = resolveConfidenceLabel(confidenceLevel, season.isBackfilling)
  const scopeNote = resolveScopeNote(season, trendSampleCount)

  return {
    sourceLabel: season.seasonSourceLabel,
    sampleLabel: formatSampleLabel(season.seasonSampleCount),
    sampleSize: season.seasonSampleCount,
    confidenceLevel,
    confidenceLabel: seasonConfidenceLabel,
    isPartial: season.isPartial,
    isComplete: season.isComplete,
    isBackfilling: season.isBackfilling,
    usedRankGames: season.seasonSampleCount,
    usedRecentMatches: recentMatchCount,
    seasonSourceLabel: season.seasonSourceLabel,
    seasonSampleLabel: formatSampleLabel(season.seasonSampleCount),
    seasonSampleCount: season.seasonSampleCount,
    seasonConfidenceLabel,
    trendBasisLabel,
    trendSampleCount,
    scopeNote,
  }
}
