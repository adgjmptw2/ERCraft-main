import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { isRealMode } from '@/api/erClient'
import { getPlayerSeasonAggregate } from '@/api/player'

import {
  ProfileAnalysisTab,
  ProfileHero,
  ProfileRecordsTab,
  SeasonHistoryGrid,
  ProfileTabNav,
  type ProfileTabId,
} from '@/components/profile'
import type { DemoSeasonSnapshot } from '@/mocks/seasonHistory'
import {
  DEMO_LATEST_SEASON,
  getDemoPlayerAnalysisReportForSeason,
  getDemoPlayerAnalysisCharacterReportsForSeason,
  getDemoAnalysisMatchesForSeason,
  getDemoAnalysisPopulationMatches,
  getDemoPlayStylePopulationMatchSets,
  getDemoPlayStyleTierPopulationMatchSets,
  getDemoPlayerCharacterReportsForSeason,
  getDemoPlayerCompactSummary,
  getDemoPlayStyleAnalysisForSeason,
  getDemoPlayerRankingPosition,
  getDemoPlayerRpTrendForSeason,
  getDemoPlayerSeasonHistory,
  getDemoSeasonSnapshot,
} from '@/mocks/loader'
import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'
import { resolveCharacterDisplayName } from '@/utils/characterMap'
import { ApiError } from '@/utils/apiError'
import { mapSearchErrorToUserMessage } from '@/utils/searchErrorMessage'
import {
  PROFILE_NOT_FOUND_DESCRIPTION,
  PROFILE_NOT_FOUND_TITLE,
  PROFILE_SEASONS_SECTION_ERROR,
  PROFILE_STATS_SECTION_ERROR,
  shouldShowProfileFatalError,
  shouldShowQuerySectionError,
} from '@/utils/playerError'
import { PROFILE_IDENTITY_MISMATCH_MESSAGE } from '@/utils/profileIdentityMessage'
import {
  buildFallbackSeasonSnapshot,
} from '@/utils/profileSeasonFallback'
import { parsePlayerNicknameParam } from '@/utils/profilePath'
import {
  EmptyState,
  Skeleton,
  SkeletonCard,
} from '@/components/shared'
import { useProfileIdentityHandoffTrace } from '@/hooks/useProfileIdentityHandoffTrace'
import { useProfileIdentity } from '@/hooks/useProfileIdentity'
import { useProfileSeasonsHandoff } from '@/hooks/useProfileSeasonsHandoff'
import { useDeferredProfileInitialReady } from '@/hooks/useDeferredProfileInitialReady'
import { useDeferredProfileMatches } from '@/hooks/useDeferredProfileMatches'
import { useMatchDTOHistory } from '@/hooks/useMatchDTOHistory'
import { useProfileRefresh } from '@/hooks/useProfileRefresh'
import { useRecentMatchFreshness } from '@/hooks/useRecentMatchFreshness'
import { useProfileEntryFreshness } from '@/hooks/useProfileEntryFreshness'
import { usePlayerStatsDTO } from '@/hooks/usePlayerStatsDTO'
import { useStableCharacterStats } from '@/hooks/useStableCharacterStats'
import { usePlayerSummary } from '@/hooks/usePlayerSummary'
import { usePlayerAnalysis } from '@/hooks/usePlayerAnalysis'
import { gateStatsPayloadWithResult, gateMatchItemsByOwner, resolveStatsPayloadUserNum } from '@/utils/profileOwnerGate'
import type { MatchSummaryDTO } from '@/types/match'
import type { MatchHistoryMode } from '@/types/matchMode'
import { matchHistoryFilteredEmptyMessage } from '@/types/matchMode'
import type {
  PlayerSeasonAggregateDTO,
  PlayerSummary,
  SeasonCharacterAggregateDTO,
} from '@/types/player'
import { toSeasonSnapshot } from '@/types/season'
import {
  buildRealProfileAnalysis,
  buildRealProfileCharacterReports,
  applyTierConditionedOverallGrade,
  RANK_AGGREGATE_STATS_LABEL,
  SEASON_CHARACTER_STATS_LABEL,
} from '@/analysis/realProfileReport'
import { buildAnalysisTabMeta } from '@/analysis/analysisTabMeta'
import type { AnalysisGrade, CharacterAnalysisReport } from '@/analysis/types'
import { getAnalysisBasisLabel, type AnalysisScope } from '@/utils/analysisAggregation'
import {
  filterProfileCharacterStatMatches,
  filterSeasonMatches,
  sortMatchesByDateDesc,
} from '@/utils/characterStatsFromMatches'
import {
  type RpChartViewModel,
} from '@/utils/rpSeries'
import { RP_TREND_DESCRIPTION } from '@/utils/rpTrendPoints'
import {
  resolveProfileSeasonAggregate,
  formatSeasonAggregateCoverageText,
} from '@/utils/seasonAggregateDisplay'
import {
  isRichSeasonAggregate,
  shouldAllowLiveAggregateUpdate,
  shouldFreezeProfileSnapshot,
} from '@/utils/profileSnapshotPolicy'
import {
  isCurrentSeasonView,
  isSeasonChipSelectable,
  PAST_SEASON_ANALYSIS_UNAVAILABLE,
  PAST_SEASON_RECORDS_NOTICE,
  PROFILE_RP_TREND_ENABLED,
} from '@/utils/profileSeasonPolicy'

type QueryPhase = 'idle' | 'loading' | 'success' | 'error'

function queryPhase(
  q: Pick<UseQueryResult, 'isPending' | 'isError' | 'isSuccess' | 'fetchStatus'>,
): QueryPhase {
  if (q.isPending) return 'loading'
  if (q.isError) return 'error'
  if (q.isSuccess) return 'success'
  return q.fetchStatus === 'idle' ? 'idle' : 'loading'
}

function isAnalysisGrade(value: string | undefined): value is AnalysisGrade {
  return value === 'S' || value === 'A' || value === 'B' || value === 'C' || value === 'D'
}

const SEASON_AGGREGATE_POLL_INTERVAL_MS = import.meta.env.MODE === 'test' ? 50 : 4_000
const SEASON_AGGREGATE_MAX_POLL_COUNT = 30
const SEASON_AGGREGATE_INITIAL_DEFER_MS = import.meta.env.MODE === 'test' ? 20 : 400
const COLD_AGGREGATE_NOTICE =
  '검색된 유저 기준으로 시즌 기록을 단계적으로 수집 중입니다. 처음 조회하는 유저는 공식 API 응답 때문에 조금 더 걸릴 수 있습니다.'
const BACKGROUND_COLLECTION_NOTICE = '백그라운드에서 시즌 기록을 추가 수집 중입니다.'
const AGGREGATE_ERROR_NOTICE =
  '시즌 집계 응답을 확인하지 못했습니다. 공식 API 응답을 기다리거나 잠시 후 집계 다시 확인을 눌러 주세요.'

function isSeasonAggregateRefreshing(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
): boolean {
  if (!aggregate) return false
  if (aggregate.isRefreshing === false) return false
  if (aggregate.isRefreshing === true) return true
  if (aggregate.backfillProgress?.status === 'complete') return false
  return (
    aggregate.cacheStatus === 'partial' ||
    aggregate.cacheStatus === 'warming' ||
    aggregate.cacheStatus === 'stale'
  )
}

function aggregateCharacterStatsLabel(
  aggregate: PlayerSeasonAggregateDTO,
  hasDisplayableReports: boolean,
): string {
  if (aggregate.cacheStatus === 'ready') {
    return aggregate.source === 'officialStats'
      ? '공식 시즌 통계 기준'
      : '수집된 시즌 경기 기준'
  }
  if (hasDisplayableReports) return '수집된 경기 기준 · 백그라운드 보강 중'
  return '시즌 집계 중'
}

function isBackfillComplete(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
): boolean {
  return (
    aggregate?.backfillProgress?.status === 'complete' ||
    (aggregate?.isRefreshing === false && aggregate?.cacheStatus === 'ready')
  )
}

function aggregateCoverageText(aggregate: PlayerSeasonAggregateDTO): string | null {
  return formatSeasonAggregateCoverageText(aggregate)
}

function aggregateRefreshNotice(
  aggregate: PlayerSeasonAggregateDTO | null,
  hasDisplayableReports: boolean,
): string | null {
  if (!aggregate) return null
  if (isBackfillComplete(aggregate)) return null
  if (!isSeasonAggregateRefreshing(aggregate)) return null
  if (hasDisplayableReports) {
    const coverage = aggregateCoverageText(aggregate)
    return coverage ? `${BACKGROUND_COLLECTION_NOTICE} ${coverage}` : BACKGROUND_COLLECTION_NOTICE
  }
  const coverage = aggregateCoverageText(aggregate)
  return [
    '수집된 경기 기준으로 먼저 표시 중입니다.',
    coverage ?? '수집된 경기 기준으로 단계적으로 반영됩니다.',
    '공식 API 제한으로 집계가 단계적으로 반영되며, 잠시 후 자동으로 갱신됩니다.',
  ].join(' ')
}

function temporaryRecentMatchesLabel(matchCount: number): string | null {
  return matchCount > 0 ? `최근 ${matchCount}경기 임시 기준` : null
}

function mapAggregateCharacterReport(row: SeasonCharacterAggregateDTO): CharacterAnalysisReport {
  const gradeToken = row.gradeLabel?.split(' ')[0]?.split('·')[0]?.trim()
  const overallGrade = isAnalysisGrade(gradeToken) ? gradeToken : null
  const hasPerformanceGrade = row.gradeStatus != null
  const status =
    row.gradeStatus === 'insufficient-sample'
      ? ('insufficient-sample' as const)
      : row.games >= 3
        ? ('ok' as const)
        : ('insufficient-sample' as const)

  return {
    characterNum: row.characterNum,
    characterName: resolveCharacterDisplayName(row.characterNum, row.characterName),
    matchCount: row.games,
    avgPlacement: row.avgRank ?? 0,
    avgKills: row.avgKills ?? Number.NaN,
    avgAssists: row.games > 0 ? row.assists / row.games : Number.NaN,
    avgTeamKills: row.avgTeamKills,
    avgDamageToPlayers: row.avgDamage,
    kda: row.kda ?? Number.NaN,
    top3Rate: 0,
    winRate: row.winRate,
    overallScore: null,
    status,
    overallGrade,
    grade: row.grade ?? null,
    gradeScore: row.gradeScore ?? null,
    gradeStatus: row.gradeStatus,
    gradeConfidence: row.gradeConfidence ?? null,
    gradeSampleSize: row.gradeSampleSize,
    gradeBaselineTierKey: row.gradeBaselineTierKey ?? null,
    gradeRole: row.gradeRole ?? null,
    gradeUsedFallback: row.gradeUsedFallback ?? false,
    gradeFallback: row.gradeFallback,
    gradeAggregation: row.gradeAggregation,
    analysisAxes: row.analysisAxes,
    gradeLabel: hasPerformanceGrade
      ? row.grade ?? '-'
      : row.gradeLabel && row.gradeLabel !== '시즌'
        ? row.gradeLabel
        : '-',
    totalRpDelta: row.totalRpDelta ?? null,
    feedback: hasPerformanceGrade
      ? 'PlayerMatch 기준 실제 성과 등급입니다.'
      : status === 'ok'
        ? '서버 시즌 집계 캐시 기준입니다.'
        : '시즌 표본이 부족해 참고용으로만 표시합니다.',
  }
}

function mapAggregateCharacterReports(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
): CharacterAnalysisReport[] {
  return mapSeasonCharacterAggregateReports(aggregate?.characterStats)
}

function mapSeasonCharacterAggregateReports(
  rows: ReadonlyArray<SeasonCharacterAggregateDTO> | null | undefined,
): CharacterAnalysisReport[] {
  return (rows ?? [])
    .filter((row) => row.games > 0)
    .map(mapAggregateCharacterReport)
    .sort((a, b) => b.matchCount - a.matchCount)
}

function buildAggregateRpChartViewModel(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
  isFetching: boolean,
): RpChartViewModel {
  const points =
    aggregate?.rpSeries.map((point, index) => ({
      matchId: point.matchId ?? `season-rp-${aggregate.apiSeasonId}-${index}`,
      dateLabel: point.dateLabel,
      rpAfter: point.rpAfter,
      rpDelta: point.rpDelta ?? undefined,
      dayMinRp: point.dayMinRp,
      dayMaxRp: point.dayMaxRp,
      gamesPlayed: point.gamesPlayed,
    })) ?? []
  const state = points.length >= 2
    ? 'ready'
    : points.length === 1
      ? 'insufficientData'
      : 'unavailable'

  return {
    state,
    points,
    title: 'RP 추이',
    description: points.length > 0
      ? `수집된 랭크 경기 기준 · 최근 RP 포인트 ${points.length}개`
      : (aggregate?.basisLabel ?? RP_TREND_DESCRIPTION),
    emptyTitle: isFetching
      ? 'RP 흐름 집계 중'
      : state === 'insufficientData'
        ? '랭크 RP 날짜가 충분하지 않습니다'
        : 'RP 흐름 데이터 없음',
    emptyDescription: isFetching
      ? '검색된 유저 기준으로 RP 흐름을 집계 중입니다. 랭크 RP가 포함된 경기를 수집하면 표시됩니다.'
      : state === 'insufficientData'
        ? '시즌 집계 캐시에 RP 기록은 있지만, 흐름을 그리려면 서로 다른 날짜의 기록이 더 필요합니다.'
        : '표시할 RP 흐름 데이터가 아직 없습니다. 공식 API 응답에 RP 값이 없는 경기는 그래프에 포함하지 않습니다.',
  }
}

function ProfilePageDebug({
  nickname,
  summary,
  stats,
  seasons,
  matches,
  selectedSeason,
  regression,
}: {
  nickname: string
  summary: QueryPhase
  stats: QueryPhase
  seasons: QueryPhase
  matches: QueryPhase
  selectedSeason: number
  regression?: {
    summaryUserNum: number | null
    statsCharRows: number
    playerMatchCharRows: number
    characterSource: string
    characterRowCount: number
    summaryLastRefreshedAt: string | null
    displayedLastRefreshedAt: string | null
  }
}) {
  const profileDebugEnabled =
    import.meta.env.DEV && import.meta.env.VITE_PROFILE_DEBUG === 'true'

  if (!profileDebugEnabled) return null

  return (
    <details className="text-muted-foreground border-border/60 mt-4 rounded-md border px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none">Profile debug (dev)</summary>
      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="font-medium">apiMode</dt>
          <dd>{isRealMode() ? 'external' : 'mock'}</dd>
        </div>
        <div>
          <dt className="font-medium">nickname</dt>
          <dd className="break-all">{nickname || '(empty)'}</dd>
        </div>
        <div>
          <dt className="font-medium">summary</dt>
          <dd>{summary}</dd>
        </div>
        <div>
          <dt className="font-medium">stats</dt>
          <dd>{stats}</dd>
        </div>
        <div>
          <dt className="font-medium">seasons</dt>
          <dd>{seasons}</dd>
        </div>
        <div>
          <dt className="font-medium">matches</dt>
          <dd>{matches}</dd>
        </div>
        <div>
          <dt className="font-medium">selectedSeason</dt>
          <dd>S{selectedSeason}</dd>
        </div>
        {regression ? (
          <>
            <div>
              <dt className="font-medium">summaryUserNum</dt>
              <dd>{regression.summaryUserNum ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium">statsCharRows</dt>
              <dd>{regression.statsCharRows}</dd>
            </div>
            <div>
              <dt className="font-medium">playerMatchCharRows</dt>
              <dd>{regression.playerMatchCharRows}</dd>
            </div>
            <div>
              <dt className="font-medium">characterSource</dt>
              <dd>{regression.characterSource}</dd>
            </div>
            <div>
              <dt className="font-medium">characterRowCount(UI)</dt>
              <dd>{regression.characterRowCount}</dd>
            </div>
            <div>
              <dt className="font-medium">summaryLastRefreshedAt</dt>
              <dd className="break-all">{regression.summaryLastRefreshedAt ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium">displayedLastRefreshedAt</dt>
              <dd className="break-all">{regression.displayedLastRefreshedAt ?? '—'}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </details>
  )
}

export function ProfilePage() {
  const { nickname: nicknameParam } = useParams()
  const nickname = parsePlayerNicknameParam(nicknameParam)
  const [activeTab, setActiveTab] = useState<ProfileTabId>('records')
  const [seasonOverrideState, setSeasonOverrideState] = useState<{
    nicknameKey: string
    season: number | null
  }>({ nicknameKey: '', season: null })
  const [analysisScope, setAnalysisScope] = useState<AnalysisScope>('recent20')
  const seasonAggregatePollCountRef = useRef(0)
  const [stashedSeasonAggregate, setStashedSeasonAggregate] = useState<{
    key: string
    aggregate: PlayerSeasonAggregateDTO
  } | null>(null)
  const [liveSnapshotUnlockNickname, setLiveSnapshotUnlockNickname] = useState<string | null>(
    null,
  )
  const [entryFreshnessSuppressedUntil, setEntryFreshnessSuppressedUntil] = useState(0)
  const queryClient = useQueryClient()
  const playerDataSource = isRealMode() ? 'real' : 'demo'

  const summaryQuery = usePlayerSummary(nickname, playerDataSource)
  const summary = summaryQuery.data ?? undefined
  const profileIdentity = useProfileIdentity(nickname, summary, summaryQuery)
  const routeSummaryReady = profileIdentity.routeSummaryReady
  const userNum = profileIdentity.canonicalUserNum ?? 0
  const summaryReady = summaryQuery.isSuccess && summary != null && routeSummaryReady
  const realProfileActive = isRealMode() && nickname.trim().length > 0
  const profileDataEnabled = isRealMode() ? realProfileActive && routeSummaryReady : summaryReady

  const ownerScope = playerQueryOwnerScope({
    nickname,
    userNum: profileIdentity.canonicalUserNum,
    dataSource: playerDataSource,
  })
  const summaryPendingScope = playerQueryOwnerScope({
    nickname,
    dataSource: playerDataSource,
  })

  const statsQuery = usePlayerStatsDTO(
    ownerScope,
    {
      tier: summary?.tier,
      normalizedTier: summary?.normalizedTier,
      leaderboardRank: summary?.leaderboardRank,
      userNum: profileIdentity.canonicalUserNum ?? undefined,
    },
    profileDataEnabled,
  )

  const profileNicknameKey = profileIdentity.normalizedNickname
  if (
    seasonOverrideState.nicknameKey !== profileNicknameKey &&
    seasonOverrideState.season !== null
  ) {
    setSeasonOverrideState({ nicknameKey: profileNicknameKey, season: null })
  }
  const profileIdentityKeyValue = profileIdentity.profileOwnerKey

  const matchesDeferredEnabled = useDeferredProfileMatches(
    nickname,
    profileDataEnabled && routeSummaryReady,
    summaryReady,
  )

  const [recordsMatchModeState, setRecordsMatchModeState] = useState({
    nicknameKey: profileNicknameKey,
    mode: 'all' as MatchHistoryMode,
  })

  if (recordsMatchModeState.nicknameKey !== profileNicknameKey) {
    setRecordsMatchModeState({ nicknameKey: profileNicknameKey, mode: 'all' })
  }

  const recordsMatchMode = recordsMatchModeState.mode
  const setRecordsMatchMode = (mode: MatchHistoryMode) => {
    setRecordsMatchModeState({ nicknameKey: profileNicknameKey, mode })
  }

  /** current season mode-scoped recent matches — DB-first, tab cache isolated */
  const matchesQuery = useMatchDTOHistory(
    ownerScope,
    profileDataEnabled && matchesDeferredEnabled,
    recordsMatchMode,
  )

  /** analysis keeps an all-mode source so record tab switches do not change analysis input */
  const analysisMatchesQuery = useMatchDTOHistory(
    ownerScope,
    profileDataEnabled && matchesDeferredEnabled,
    'all',
  )

  const rawStatsDto = statsQuery.data?.data ?? null
  const statsOwnerGate = useMemo(
    () => gateStatsPayloadWithResult(rawStatsDto, profileIdentity.canonicalUserNum),
    [rawStatsDto, profileIdentity.canonicalUserNum],
  )
  const statsDto = statsOwnerGate.status === 'accepted' ? statsOwnerGate.data : null
  const statsPayloadOwnerUserNum = resolveStatsPayloadUserNum(rawStatsDto)

  const currentSeasonForQuery = summary?.currentSeason ?? DEMO_LATEST_SEASON
  const initialProfileReadyKey =
    profileDataEnabled && profileIdentity.phase === 'ready' && profileIdentity.canonicalUserNum != null
      ? `${profileIdentity.navigationKey}:${profileIdentity.normalizedNickname}:${profileIdentity.canonicalUserNum}`
      : null
  const profileSeasonId = summary?.currentSeason ?? DEMO_LATEST_SEASON
  const hasCachedAggregate =
    initialProfileReadyKey != null &&
    Boolean(
      queryClient.getQueryData<PlayerSeasonAggregateDTO>(
        playerQueryKeys.seasonAggregate(ownerScope, profileSeasonId),
      ),
    )

  const seasonAggregateInitialReady = useDeferredProfileInitialReady(
    initialProfileReadyKey,
    hasCachedAggregate,
    SEASON_AGGREGATE_INITIAL_DEFER_MS,
  )

  const seasonsHandoff = useProfileSeasonsHandoff({
    identity: profileIdentity,
    profileDataEnabled,
    summary,
    queryClient,
    statsDto,
    dataSource: playerDataSource,
  })

  const {
    seasonsApiData,
    seasonHistory: realSeasonHistory,
    seasonsDisplayState,
    seasonsLoading,
    pastSeasonsHasError,
    currentSeasonsQuery,
    fullRangeSeasonsEnabled,
    pastSeasonsRangeEnabled,
    identityHandoffSeasonsQueryKey,
    identityHandoffSeasonsEnabled,
    apiCurrentSeason,
  } = seasonsHandoff

  const pastSeasonsTo = Math.max(1, currentSeasonForQuery - 1)

  const {
    refresh: refreshProfile,
    isRefreshing: isProfileRefreshing,
    manualRefreshActive,
    lastRefreshedAt: profileLastRefreshedAt,
    freshnessLabel: profileFreshnessLabel,
    refreshError: profileRefreshError,
    refreshStatusMessage: profileRefreshStatusMessage,
    canRefresh: canRefreshProfile,
  } = useProfileRefresh(nickname, {
    initialLastRefreshedAt: summary?.lastRefreshedAt,
    initialLastCheckedAt: summary?.lastCheckedAt,
    navigationKey: profileIdentity.navigationKey,
    matchMode: recordsMatchMode,
    seasonId: currentSeasonForQuery,
    dataSource: playerDataSource,
    ownerScope,
    statsDtoOptions: {
      userNum: profileIdentity.canonicalUserNum ?? undefined,
      normalizedTier: summary?.normalizedTier,
      leaderboardRank: summary?.leaderboardRank,
    },
    onManualRefreshEnd: (success, context) => {
      if (success) {
        setEntryFreshnessSuppressedUntil(Date.now() + 30_000)
      }
      if (
        success &&
        context.term === profileIdentity.normalizedNickname &&
        context.navigationKey === profileIdentity.navigationKey
      ) {
        setLiveSnapshotUnlockNickname(profileIdentity.normalizedNickname)
      }
    },
  })

  const { phase: entryFreshnessPhase } = useProfileEntryFreshness({
    enabled:
      profileDataEnabled &&
      summaryReady &&
      routeSummaryReady &&
      summary?.hasProfileCache === true,
    nickname,
    navigationKey: profileIdentity.navigationKey,
    seasonId: currentSeasonForQuery,
    userNum: profileIdentity.canonicalUserNum ?? undefined,
    dataSource: playerDataSource,
    ownerScope,
    matchMode: recordsMatchMode,
    manualRefreshActive: manualRefreshActive || isProfileRefreshing,
    entryFreshnessSuppressed: Date.now() < entryFreshnessSuppressedUntil,
  })

  useRecentMatchFreshness({
    enabled:
      profileDataEnabled &&
      summaryReady &&
      routeSummaryReady &&
      entryFreshnessPhase !== 'checking',
    nickname,
    navigationKey: profileIdentity.navigationKey,
    dataSource: playerDataSource,
    ownerScope,
    expectedUserNum: profileIdentity.canonicalUserNum,
    summary,
    manualRefreshActive: manualRefreshActive || isProfileRefreshing,
  })

  const liveSnapshotUnlocked =
    liveSnapshotUnlockNickname === profileIdentity.normalizedNickname &&
    profileIdentity.routeSummaryReady

  const isFirstCollect =
    isRealMode() && summaryReady && summary?.hasProfileCache === false

  const selectedSeason =
    seasonOverrideState.nicknameKey === profileNicknameKey &&
    seasonOverrideState.season != null
      ? seasonOverrideState.season
      : (apiCurrentSeason ?? DEMO_LATEST_SEASON)

  const currentSeasonId = apiCurrentSeason ?? summary?.currentSeason ?? DEMO_LATEST_SEASON
  const isViewingCurrentSeason = isCurrentSeasonView(selectedSeason, currentSeasonId)

  const playerAnalysisQuery = usePlayerAnalysis({
    nickname,
    userNum: profileIdentity.canonicalUserNum,
    seasonId: currentSeasonId,
    enabled: isRealMode() && routeSummaryReady && isViewingCurrentSeason,
  })
  const playerAnalysisData = playerAnalysisQuery.data ?? null

  const seasonAggregateInputsReady = statsQuery.isSuccess || statsQuery.isError

  const seasonAggregateEnabled =
    isRealMode() &&
    profileDataEnabled &&
    summaryReady &&
    seasonAggregateInitialReady &&
    nickname.trim().length > 0 &&
    seasonAggregateInputsReady &&
    isViewingCurrentSeason &&
    Number.isFinite(selectedSeason) &&
    selectedSeason > 0

  const seasonAggregateQuery = useQuery({
    queryKey: playerQueryKeys.seasonAggregate(ownerScope, selectedSeason),
    queryFn: async () => {
      const res = await getPlayerSeasonAggregate(nickname.trim(), selectedSeason)
      return res.data
    },
    enabled: seasonAggregateEnabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: () =>
      queryClient.getQueryData<PlayerSeasonAggregateDTO>(
        playerQueryKeys.seasonAggregate(ownerScope, selectedSeason),
      ),
    retry: (failureCount: number, error: Error) =>
      failureCount < 2 && error instanceof ApiError && error.code === 'RATE_LIMITED',
    retryDelay: 1_500,
  })
  const refetchSeasonAggregate = seasonAggregateQuery.refetch
  const seasonAggregateIsFetching = seasonAggregateQuery.isFetching

  const seasonAggregateStashKeyValue =
    summaryReady &&
    summary &&
    routeSummaryReady &&
    Number.isFinite(currentSeasonId) &&
    currentSeasonId > 0 &&
    isViewingCurrentSeason
      ? `${profileIdentityKeyValue}:${currentSeasonId}`
      : null

  const hasRichDisplayedSnapshot =
    isRichSeasonAggregate(stashedSeasonAggregate?.aggregate) ||
    isRichSeasonAggregate(seasonAggregateQuery.data)

  const snapshotFrozen = shouldFreezeProfileSnapshot({
    hasRichDisplayedSnapshot,
    isFirstCollect,
    manualRefreshActive: manualRefreshActive || liveSnapshotUnlocked,
  })

  const seasonAggregateResolved = useMemo(() => {
    if (!isRealMode() || !summary || !seasonAggregateStashKeyValue) {
      return {
        aggregate: null as PlayerSeasonAggregateDTO | null,
        pickReason: 'none' as const,
      }
    }

    const lastValid =
      stashedSeasonAggregate?.key === seasonAggregateStashKeyValue
        ? stashedSeasonAggregate.aggregate
        : null

    const allowLive = shouldAllowLiveAggregateUpdate({
      frozen: snapshotFrozen,
      displayed: lastValid,
      incoming: seasonAggregateQuery.data,
    })

    const resolved = resolveProfileSeasonAggregate({
      raw: allowLive ? seasonAggregateQuery.data : undefined,
      summaryUserNum: summary.userNum,
      selectedSeason: currentSeasonId,
      lastValid,
    })

    return {
      aggregate: resolved.aggregate,
      pickReason: resolved.pickReason,
    }
  }, [
    seasonAggregateQuery.data,
    summary,
    currentSeasonId,
    seasonAggregateStashKeyValue,
    stashedSeasonAggregate,
    snapshotFrozen,
  ])

  const seasonAggregate = seasonAggregateResolved.aggregate

  if (!seasonAggregateStashKeyValue) {
    if (stashedSeasonAggregate !== null) {
      setStashedSeasonAggregate(null)
    }
  } else if (
    stashedSeasonAggregate &&
    stashedSeasonAggregate.key !== seasonAggregateStashKeyValue
  ) {
    setStashedSeasonAggregate(
      seasonAggregate
        ? { key: seasonAggregateStashKeyValue, aggregate: seasonAggregate }
        : null,
    )
  } else if (
    seasonAggregate &&
    (stashedSeasonAggregate?.key !== seasonAggregateStashKeyValue ||
      stashedSeasonAggregate.aggregate !== seasonAggregate)
  ) {
    setStashedSeasonAggregate({
      key: seasonAggregateStashKeyValue,
      aggregate: seasonAggregate,
    })
  }

  const seasonAggregateRefreshing = isSeasonAggregateRefreshing(seasonAggregate)

  useEffect(() => {
    if (!seasonAggregateEnabled) return
    seasonAggregatePollCountRef.current = 0
  }, [nickname, currentSeasonId, summary?.userNum, seasonAggregateEnabled])

  useEffect(() => {
    if (!seasonAggregateEnabled) return
    if (!isRealMode()) return
    if (snapshotFrozen) {
      seasonAggregatePollCountRef.current = 0
      return
    }
    if (!seasonAggregateRefreshing) {
      seasonAggregatePollCountRef.current = 0
      return
    }
    if (seasonAggregateIsFetching) return
    if (seasonAggregatePollCountRef.current >= SEASON_AGGREGATE_MAX_POLL_COUNT) return

    const timer = window.setTimeout(() => {
      seasonAggregatePollCountRef.current += 1
      void refetchSeasonAggregate()
    }, SEASON_AGGREGATE_POLL_INTERVAL_MS)

    return () => window.clearTimeout(timer)
  }, [
    nickname,
    currentSeasonId,
    seasonAggregateRefreshing,
    seasonAggregateIsFetching,
    refetchSeasonAggregate,
    snapshotFrozen,
    seasonAggregateEnabled,
  ])

  const handleSeasonChange = (season: number) => {
    if (isRealMode() && !isSeasonChipSelectable(season, currentSeasonId, true)) return
    setSeasonOverrideState({ nicknameKey: profileNicknameKey, season })
  }

  const seasonHistory = useMemo(() => {
    if (!isRealMode()) {
      return userNum > 0 ? getDemoPlayerSeasonHistory(userNum) : []
    }
    return realSeasonHistory
  }, [realSeasonHistory, userNum])

  const seasonSnapshot = useMemo((): DemoSeasonSnapshot | null => {
    if (!isRealMode()) {
      return userNum > 0 ? getDemoSeasonSnapshot(userNum, selectedSeason) : null
    }
    if (!summary || !routeSummaryReady) return null

    const record = seasonsApiData?.seasons.find(
      (season) => season.seasonNumber === selectedSeason,
    )
    if (record) {
      return toSeasonSnapshot(record) as DemoSeasonSnapshot
    }

    const currentSeason = apiCurrentSeason ?? summary.currentSeason
    if (selectedSeason !== currentSeason) {
      return null
    }

    return buildFallbackSeasonSnapshot(summary, selectedSeason, statsDto)
  }, [seasonsApiData, userNum, selectedSeason, summary, statsDto, apiCurrentSeason, routeSummaryReady])

  // real 모드에선 데모 닉네임과 우연히 겹쳐도 데모 데이터가 섞이지 않도록 차단
  const demoNickname = !isRealMode() && summary ? summary.nickname : null

  const loadedPaginatedMatches = useMemo(
    (): MatchSummaryDTO[] =>
      gateMatchItemsByOwner(
        matchesQuery.data?.pages.flatMap((page) => page.data.items) ?? [],
        profileIdentity.canonicalUserNum,
      ),
    [matchesQuery.data, profileIdentity.canonicalUserNum],
  )
  const allModeMatchesForAnalysis = useMemo(
    (): MatchSummaryDTO[] =>
      gateMatchItemsByOwner(
        analysisMatchesQuery.data?.pages.flatMap((page) => page.data.items) ?? [],
        profileIdentity.canonicalUserNum,
      ),
    [analysisMatchesQuery.data, profileIdentity.canonicalUserNum],
  )
  const loadedMatchPageCount = matchesQuery.data?.pages.length ?? 0
  const analysisLoadedPageCount = analysisMatchesQuery.data?.pages.length ?? 0
  const matchesReadyForAutoPrefetch =
    matchesQuery.isSuccess &&
    !matchesQuery.isFetching &&
    !matchesQuery.isFetchingNextPage &&
    (matchesQuery.hasNextPage ?? false)
  const fetchNextMatchPage = matchesQuery.fetchNextPage
  const analysisReadyForAutoPrefetch =
    analysisMatchesQuery.isSuccess &&
    !analysisMatchesQuery.isFetching &&
    !analysisMatchesQuery.isFetchingNextPage &&
    (analysisMatchesQuery.hasNextPage ?? false)
  const fetchNextAnalysisPage = analysisMatchesQuery.fetchNextPage

  useEffect(() => {
    if (!isRealMode()) return
    if (!profileDataEnabled || !summaryReady) return
    if (!analysisReadyForAutoPrefetch) return
    if (analysisLoadedPageCount === 0 || analysisLoadedPageCount >= 3) return
    void fetchNextAnalysisPage()
  }, [
    profileDataEnabled,
    summaryReady,
    analysisReadyForAutoPrefetch,
    analysisLoadedPageCount,
    fetchNextAnalysisPage,
  ])

  useEffect(() => {
    if (!isRealMode()) return
    if (!profileDataEnabled || !summaryReady) return
    if (!matchesReadyForAutoPrefetch) return
    if (loadedMatchPageCount === 0 || loadedMatchPageCount >= 3) return
    void fetchNextMatchPage()
  }, [
    profileDataEnabled,
    summaryReady,
    matchesReadyForAutoPrefetch,
    loadedMatchPageCount,
    fetchNextMatchPage,
  ])

  const displayedSummary = useMemo((): PlayerSummary | null => {
    if (!summary || !routeSummaryReady) return null
    const accountLevel = loadedPaginatedMatches.find(
      (match) => typeof match.accountLevel === 'number' && Number.isFinite(match.accountLevel),
    )?.accountLevel
    if (accountLevel == null || summary.level === accountLevel) return summary
    return { ...summary, level: accountLevel }
  }, [summary, loadedPaginatedMatches, routeSummaryReady])

  const allRecentSeasonMatches = useMemo((): MatchSummaryDTO[] => {
    if (isRealMode() && !isViewingCurrentSeason) return []
    if (isRealMode() && !routeSummaryReady) return []

    const seasonFallback = isRealMode() ? currentSeasonId : DEMO_LATEST_SEASON
    return filterSeasonMatches(loadedPaginatedMatches, currentSeasonId, seasonFallback)
  }, [
    loadedPaginatedMatches,
    currentSeasonId,
    isViewingCurrentSeason,
    routeSummaryReady,
  ])

  const matchItems = useMemo((): MatchSummaryDTO[] => {
    return sortMatchesByDateDesc(allRecentSeasonMatches)
  }, [allRecentSeasonMatches])

  const seasonMatchesForStats = useMemo(() => {
    if (!isRealMode() || !routeSummaryReady) return []
    const seasonFallback = currentSeasonId
    return filterSeasonMatches(allModeMatchesForAnalysis, currentSeasonId, seasonFallback)
  }, [allModeMatchesForAnalysis, currentSeasonId, routeSummaryReady])

  const realProfileAnalysis = useMemo(() => {
    if (!isRealMode() || !summary || !routeSummaryReady) return null
    return buildRealProfileAnalysis({
      nickname: summary.nickname,
      statsDto,
      currentSeason: currentSeasonId,
      selectedSeason: currentSeasonId,
      loadedMatches: allModeMatchesForAnalysis,
    })
  }, [
    summary,
    statsDto,
    currentSeasonId,
    allModeMatchesForAnalysis,
    routeSummaryReady,
    profileIdentity.canonicalUserNum,
    profileIdentity.navigationKey,
  ])

  const aggregateCharacterReports = useMemo(
    () => mapAggregateCharacterReports(seasonAggregate),
    [seasonAggregate],
  )

  const playerMatchCharacterReports = useMemo(
    () => mapSeasonCharacterAggregateReports(statsDto?.playerMatchCharacterStats),
    [statsDto?.playerMatchCharacterStats],
  )

  const statsCharacterReports = useMemo(
    () => buildRealProfileCharacterReports(statsDto?.characterStats, []).reports,
    [statsDto?.characterStats],
  )

  const recentCharacterReports = useMemo(
    () => realProfileAnalysis?.analysisCharacterReports ?? [],
    [realProfileAnalysis],
  )

  const aggregateCharacterStatsShouldWait =
    isRealMode() &&
    aggregateCharacterReports.length === 0 &&
    statsCharacterReports.length === 0 &&
    recentCharacterReports.length === 0 &&
    playerMatchCharacterReports.length === 0 &&
    (
      seasonAggregateQuery.isPending ||
      seasonAggregateQuery.isFetching ||
      seasonAggregateQuery.isError ||
      seasonAggregateRefreshing
    )

  const characterStatsSelectionInput = useMemo(
    () => ({
      aggregate: seasonAggregate,
      aggregateReports: aggregateCharacterReports,
      statsReports: statsCharacterReports,
      recentReports: recentCharacterReports,
      playerMatchReports: playerMatchCharacterReports,
      aggregateShouldWait: aggregateCharacterStatsShouldWait,
    }),
    [
    seasonAggregate,
    aggregateCharacterReports,
    statsCharacterReports,
    recentCharacterReports,
    playerMatchCharacterReports,
      aggregateCharacterStatsShouldWait,
    ],
  )

  const stableCharacterStats = useStableCharacterStats({
    nickname,
    userNum,
    seasonId: currentSeasonId,
    navigationKey: profileIdentity.navigationKey,
    routeSummaryReady,
    statsUserNum: statsOwnerGate.status === 'accepted' ? statsOwnerGate.ownerUserNum : null,
    statsQueryStatus: statsQuery.status,
    statsFetchStatus: statsQuery.fetchStatus,
    statsDataUpdatedAt: statsQuery.dataUpdatedAt,
    playerMatchMeta: statsDto?.playerMatchCharacterStatsMeta,
    officialRowCount: statsDto?.characterStats?.filter((row) => row.totalGames > 0).length ?? 0,
    playerMatchRowCount:
      statsDto?.playerMatchCharacterStats?.filter((row) => row.games > 0).length ?? 0,
    selectionInput: characterStatsSelectionInput,
    manualRefreshActive,
    isFirstCollect,
    liveSnapshotUnlocked,
  })

  const characterReportSelection = stableCharacterStats.selection

  const characterReports = useMemo(
    () => {
      if (demoNickname) {
        return getDemoPlayerCharacterReportsForSeason(demoNickname, selectedSeason)
      }
      if (!routeSummaryReady) return []
      return stableCharacterStats.reports
    },
    [demoNickname, selectedSeason, stableCharacterStats.reports, routeSummaryReady],
  )

  const characterStatsBasisCount = isRealMode()
    ? realProfileAnalysis?.characterStatsSource === 'recent-matches'
      ? filterProfileCharacterStatMatches(seasonMatchesForStats).length
      : undefined
    : undefined

  const characterStatsSourceLabel = (() => {
    if (!isRealMode()) return null
    if (characterReportSelection.preferOfficialStatsDespitePartial) {
      return SEASON_CHARACTER_STATS_LABEL
    }
    if (characterReportSelection.source === 'player-match') {
      return RANK_AGGREGATE_STATS_LABEL
    }
    if (characterReportSelection.source === 'official-stats') {
      return SEASON_CHARACTER_STATS_LABEL
    }
    if (seasonAggregate && characterReportSelection.source === 'aggregate') {
      return aggregateCharacterStatsLabel(seasonAggregate, characterReports.length > 0)
    }
    if (aggregateCharacterStatsShouldWait && characterReports.length === 0) return '시즌 집계 중'
    if (statsCharacterReports.length > 0) return SEASON_CHARACTER_STATS_LABEL
    return temporaryRecentMatchesLabel(characterStatsBasisCount ?? 0)
  })()
  const characterStatsRefreshNotice = isRealMode()
    ? (aggregateRefreshNotice(seasonAggregate, characterReports.length > 0) ??
      (aggregateCharacterStatsShouldWait && characterReports.length === 0
        ? seasonAggregateQuery.isError
          ? AGGREGATE_ERROR_NOTICE
          : COLD_AGGREGATE_NOTICE
        : null))
    : null

  const showAnalysisScopeToggle = !isRealMode() && selectedSeason >= DEMO_LATEST_SEASON

  const analysisReport = useMemo(
    () => {
      if (isRealMode() && !routeSummaryReady) return null
      if (isRealMode() && !isViewingCurrentSeason) return null
      if (demoNickname) {
        return getDemoPlayerAnalysisReportForSeason(demoNickname, selectedSeason, analysisScope)
      }
      const report = applyTierConditionedOverallGrade(
        realProfileAnalysis?.analysisReport ?? null,
        characterReports,
        characterStatsSourceLabel,
        statsDto?.overallGradeV2 ?? null,
      )
      return report
        ? { ...report, teamPerformanceSummary: statsDto?.teamPerformanceSummary }
        : null
    },
    [
      demoNickname,
      selectedSeason,
      analysisScope,
      realProfileAnalysis,
      characterReports,
      characterStatsSourceLabel,
      statsDto?.overallGradeV2,
      statsDto?.teamPerformanceSummary,
      routeSummaryReady,
      isViewingCurrentSeason,
    ],
  )

  const analysisCharacterReports = useMemo(
    () => {
      if (isRealMode() && !routeSummaryReady) return []
      if (isRealMode() && !isViewingCurrentSeason) return []
      return demoNickname
        ? getDemoPlayerAnalysisCharacterReportsForSeason(
            demoNickname,
            selectedSeason,
            analysisScope,
          )
        : (
          playerMatchCharacterReports.length > 0
            ? playerMatchCharacterReports
            : (realProfileAnalysis?.analysisCharacterReports ?? [])
        )
    },
    [
      demoNickname,
      selectedSeason,
      analysisScope,
      playerMatchCharacterReports,
      realProfileAnalysis,
      routeSummaryReady,
      isViewingCurrentSeason,
    ],
  )

  const analysisTabMeta = useMemo(() => {
    if (!isRealMode() || !summary || !routeSummaryReady || !isViewingCurrentSeason) return null
    return buildAnalysisTabMeta({
      seasonAggregate,
      statsDto: statsDto ?? null,
      recentMatchCount:
        realProfileAnalysis?.analysisEligibility.analysisEligibleMatches ??
        realProfileAnalysis?.analysisMatches.length ??
        0,
      characterStatsSource: characterReportSelection.source,
      preferOfficialStatsDespitePartial:
        characterReportSelection.preferOfficialStatsDespitePartial,
    })
  }, [
    summary,
    seasonAggregate,
    statsDto,
    realProfileAnalysis?.analysisEligibility.analysisEligibleMatches,
    realProfileAnalysis?.analysisMatches.length,
    characterReportSelection.source,
    characterReportSelection.preferOfficialStatsDespitePartial,
    routeSummaryReady,
    isViewingCurrentSeason,
  ])

  const analysisBasisLabel = isRealMode()
    ? (analysisTabMeta?.sourceLabel ??
      realProfileAnalysis?.analysisBasisLabel ??
      '분석 가능한 데이터 부족')
    : getAnalysisBasisLabel(selectedSeason, analysisScope)

  const rankingPosition = useMemo(
    () => (demoNickname ? getDemoPlayerRankingPosition(demoNickname) : null),
    [demoNickname],
  )

  const compactSummary = useMemo(
    () => (demoNickname ? getDemoPlayerCompactSummary(demoNickname, selectedSeason) : null),
    [demoNickname, selectedSeason],
  )

  const rpTrend = useMemo(
    () => (demoNickname ? getDemoPlayerRpTrendForSeason(demoNickname, selectedSeason) : []),
    [demoNickname, selectedSeason],
  )

  const aggregateIsFetchingOrWarming =
    seasonAggregateQuery.isPending ||
    seasonAggregateQuery.isFetching ||
    (seasonAggregateRefreshing && (seasonAggregate?.rpSeries.length ?? 0) === 0)

  const rpChart = useMemo((): RpChartViewModel => {
    if (isRealMode()) {
      return buildAggregateRpChartViewModel(
        seasonAggregate,
        aggregateIsFetchingOrWarming,
      )
    }
    if (demoNickname) {
      const points = getDemoPlayerRpTrendForSeason(demoNickname, selectedSeason)
      const state =
        points.length >= 2 ? 'ready' : points.length === 0 ? 'unavailable' : 'insufficientData'
      return {
        state,
        points,
        title: 'RP 추이',
        description: RP_TREND_DESCRIPTION,
        emptyTitle: 'RP 흐름 데이터 없음',
        emptyDescription: '최근 경기 RP 기록이 없습니다.',
      }
    }
    return buildAggregateRpChartViewModel(null, false)
  }, [
    demoNickname,
    selectedSeason,
    aggregateIsFetchingOrWarming,
    seasonAggregate,
  ])

  const profileRegressionDebug = useMemo(() => {
    if (!import.meta.env.DEV || import.meta.env.VITE_PROFILE_DEBUG !== 'true' || !isRealMode()) {
      return undefined
    }
    return {
      summaryUserNum: summary?.userNum ?? null,
      statsCharRows: statsDto?.characterStats?.filter((row) => row.totalGames > 0).length ?? 0,
      playerMatchCharRows:
        statsDto?.playerMatchCharacterStats?.filter((row) => row.games > 0).length ?? 0,
      characterSource: characterReportSelection.source,
      characterRowCount: characterReports.length,
      summaryLastRefreshedAt: summary?.lastRefreshedAt ?? null,
      displayedLastRefreshedAt: profileLastRefreshedAt?.toISOString() ?? null,
    }
  }, [
    summary?.userNum,
    summary?.lastRefreshedAt,
    statsDto?.characterStats,
    statsDto?.playerMatchCharacterStats,
    characterReportSelection.source,
    characterReports.length,
    profileLastRefreshedAt,
  ])

  const renderedProfileOwner = profileIdentity.profileOwnerKey

  useProfileIdentityHandoffTrace({
    navigationKey: profileIdentity.navigationKey,
    profileIdentityPhase: profileIdentity.phase,
    routeNickname: nickname,
    routeSummaryReady,
    summaryQueryKey: playerQueryKeys.summary(summaryPendingScope),
    summaryQueryStatus: summaryQuery.status,
    summaryFetchStatus: summaryQuery.fetchStatus,
    summaryDataNickname: summary?.nickname ?? null,
    summaryUserNum: profileIdentity.canonicalUserNum,
    statsQueryKey: playerQueryKeys.statsDto(ownerScope, ''),
    statsQueryStatus: statsQuery.status,
    statsFetchStatus: statsQuery.fetchStatus,
    statsResponseUserNum: statsPayloadOwnerUserNum,
    payloadOwnerUserNum: statsPayloadOwnerUserNum,
    ownerGateResult: statsOwnerGate.status === 'accepted'
      ? 'accepted'
      : statsOwnerGate.status === 'rejected'
        ? statsOwnerGate.reason
        : statsOwnerGate.reason,
    statsSelectedIdentityKey: stableCharacterStats.identityKey,
    stableSnapshotIdentityKey: stableCharacterStats.identityKey,
    stableSelectionSource: characterReportSelection.source,
    stableFirstCharacter: characterReports[0]?.characterName ?? null,
    seasonsQueryKey: identityHandoffSeasonsQueryKey,
    seasonsQueryEnabled: identityHandoffSeasonsEnabled,
    seasonsRequestedRange: fullRangeSeasonsEnabled
      ? `1-${currentSeasonForQuery}`
      : pastSeasonsRangeEnabled
        ? `1-${pastSeasonsTo}`
        : `${currentSeasonForQuery}-${currentSeasonForQuery}`,
    seasonsRowCount: seasonsApiData?.seasons.length ?? 0,
    seasonsState: seasonsDisplayState,
    displayedSeasonChips: seasonHistory.map((row) => `S${row.seasonNumber}`).join(','),
    displayedOwner: renderedProfileOwner,
    renderedProfileOwner,
  })

  const playStyleAnalysis = useMemo(
    () => {
      if (isRealMode() && !routeSummaryReady) return null
      if (isRealMode() && !isViewingCurrentSeason) return null
      return demoNickname
        ? getDemoPlayStyleAnalysisForSeason(demoNickname, selectedSeason, analysisScope)
        : (realProfileAnalysis?.playStyleAnalysis ?? null)
    },
    [
      demoNickname,
      selectedSeason,
      analysisScope,
      realProfileAnalysis,
      routeSummaryReady,
      isViewingCurrentSeason,
    ],
  )

  const analysisMatches = useMemo(
    () => {
      if (isRealMode() && !routeSummaryReady) return []
      if (isRealMode() && !isViewingCurrentSeason) return []
      return demoNickname
        ? getDemoAnalysisMatchesForSeason(demoNickname, selectedSeason, analysisScope)
        : (realProfileAnalysis?.analysisMatches ?? [])
    },
    [
      demoNickname,
      selectedSeason,
      analysisScope,
      realProfileAnalysis,
      routeSummaryReady,
      isViewingCurrentSeason,
    ],
  )

  const populationMatchSets = useMemo(
    () =>
      isRealMode() ? [] : getDemoPlayStylePopulationMatchSets(selectedSeason, analysisScope),
    [selectedSeason, analysisScope],
  )

  const tierPopulationMatchSets = useMemo(
    () =>
      demoNickname
        ? getDemoPlayStyleTierPopulationMatchSets(demoNickname, selectedSeason, analysisScope)
        : [],
    [demoNickname, selectedSeason, analysisScope],
  )

  const populationMatches = useMemo(
    () => (isRealMode() ? [] : getDemoAnalysisPopulationMatches()),
    [],
  )

  if (!nickname) {
    return (
      <EmptyState
        title="닉네임을 입력해 주세요."
        action={
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
            홈으로
          </Link>
        }
      />
    )
  }

  if (summaryQuery.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-muted-foreground text-sm">
          플레이어 정보를 불러오는 중입니다. 처음 조회하는 유저는 공식 API 응답 때문에 조금 더 걸릴 수 있습니다.
        </p>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 lg:grid-cols-[35%_1fr]">
          <div className="min-h-80">
            <SkeletonCard />
          </div>
          <div className="min-h-96">
            <SkeletonCard />
          </div>
        </div>
        <ProfilePageDebug
          nickname={nickname}
          summary={queryPhase(summaryQuery)}
          stats={queryPhase(statsQuery)}
          seasons={queryPhase(currentSeasonsQuery)}
          matches={queryPhase(matchesQuery)}
          selectedSeason={selectedSeason}
        />
      </div>
    )
  }

  if (summaryQuery.isError && !summaryQuery.isFetching && summaryQuery.data == null) {
    const isNotFound = shouldShowProfileFatalError({
      nickname: profileIdentity.normalizedNickname,
      requestedNickname: profileIdentity.normalizedNickname,
      summaryQuery,
      hasDbSummary: false,
    })
    return (
      <>
        <EmptyState
          title={isNotFound ? PROFILE_NOT_FOUND_TITLE : '프로필 정보를 불러오지 못했습니다'}
          description={
            isNotFound
              ? PROFILE_NOT_FOUND_DESCRIPTION
              : mapSearchErrorToUserMessage(summaryQuery.error)
          }
          action={
            <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
              홈으로
            </Link>
          }
        />
        <ProfilePageDebug
          nickname={nickname}
          summary={queryPhase(summaryQuery)}
          stats={queryPhase(statsQuery)}
          seasons={queryPhase(currentSeasonsQuery)}
          matches={queryPhase(matchesQuery)}
          selectedSeason={selectedSeason}
        />
      </>
    )
  }

  if (summary === null || summary === undefined) {
    return (
      <>
        <EmptyState
          title={isRealMode() ? PROFILE_NOT_FOUND_TITLE : '데모 데이터에 없는 플레이어입니다'}
          description={
            isRealMode()
              ? PROFILE_NOT_FOUND_DESCRIPTION
              : '홈에서 데모 닉네임으로 검색해보세요.'
          }
          action={
            <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
              홈으로
            </Link>
          }
        />
        <ProfilePageDebug
          nickname={nickname}
          summary={queryPhase(summaryQuery)}
          stats={queryPhase(statsQuery)}
          seasons={queryPhase(currentSeasonsQuery)}
          matches={queryPhase(matchesQuery)}
          selectedSeason={selectedSeason}
        />
      </>
    )
  }

  const identityOwnerMismatch =
    isRealMode() &&
    routeSummaryReady &&
    statsOwnerGate.status === 'rejected'

  if (identityOwnerMismatch) {
    return (
      <>
        <EmptyState
          title="플레이어 정보를 확인할 수 없습니다"
          description={PROFILE_IDENTITY_MISMATCH_MESSAGE}
          action={
            <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
              홈으로
            </Link>
          }
        />
        <ProfilePageDebug
          nickname={nickname}
          summary={queryPhase(summaryQuery)}
          stats={queryPhase(statsQuery)}
          seasons={queryPhase(currentSeasonsQuery)}
          matches={queryPhase(matchesQuery)}
          selectedSeason={selectedSeason}
        />
      </>
    )
  }

  if (isRealMode() && summary && !routeSummaryReady) {
    if (summaryQuery.isFetching) {
      return (
        <div className="flex flex-col gap-6">
          <p className="text-muted-foreground text-sm">
            플레이어 정보를 불러오는 중입니다. 처음 조회하는 유저는 공식 API 응답 때문에 조금 더 걸릴 수 있습니다.
          </p>
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-6 lg:grid-cols-[35%_1fr]">
            <div className="min-h-80">
              <SkeletonCard />
            </div>
            <div className="min-h-96">
              <SkeletonCard />
            </div>
          </div>
          <ProfilePageDebug
            nickname={nickname}
            summary={queryPhase(summaryQuery)}
            stats={queryPhase(statsQuery)}
            seasons={queryPhase(currentSeasonsQuery)}
            matches={queryPhase(matchesQuery)}
            selectedSeason={selectedSeason}
          />
        </div>
      )
    }

    return (
      <>
        <EmptyState
          title="플레이어 정보를 확인할 수 없습니다"
          description={PROFILE_IDENTITY_MISMATCH_MESSAGE}
          action={
            <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
              홈으로
            </Link>
          }
        />
        <ProfilePageDebug
          nickname={nickname}
          summary={queryPhase(summaryQuery)}
          stats={queryPhase(statsQuery)}
          seasons={queryPhase(currentSeasonsQuery)}
          matches={queryPhase(matchesQuery)}
          selectedSeason={selectedSeason}
        />
      </>
    )
  }

  const safeSummary = displayedSummary ?? (routeSummaryReady ? summary : null)
  if (!safeSummary) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <ProfilePageDebug
          nickname={nickname}
          summary={queryPhase(summaryQuery)}
          stats={queryPhase(statsQuery)}
          seasons={queryPhase(currentSeasonsQuery)}
          matches={queryPhase(matchesQuery)}
          selectedSeason={selectedSeason}
        />
      </div>
    )
  }

  const matchesSource = matchesQuery.data?.pages[0]?.source
  const rp = statsDto?.mmr

  const showRpTrend = !isRealMode() && PROFILE_RP_TREND_ENABLED

  const recordsMatchesPending =
    isRealMode() &&
    isViewingCurrentSeason &&
    routeSummaryReady &&
    matchesQuery.isPending &&
    matchesQuery.data === undefined
  const aggregateIsWarming =
    characterReports.length === 0 &&
    seasonAggregate != null &&
    seasonAggregate.cacheStatus === 'warming' &&
    aggregateCharacterReports.every(
      (report) => report.avgKills == null || Number.isNaN(report.avgKills),
    )
  const characterStatsOwnerPending =
    isRealMode() &&
    routeSummaryReady &&
    statsOwnerGate.status === 'pending' &&
    (
      statsOwnerGate.reason === 'summary-pending' ||
      (
        statsOwnerGate.reason === 'owner-unverified' &&
        !statsQuery.isError &&
        (statsQuery.isPending || statsQuery.isFetching || statsQuery.isSuccess)
      )
    )
  const expectsPlayerMatchStats =
    summary?.hasProfileCache === true ||
    statsDto?.playerMatchCharacterStatsMeta != null
  const officialSparseCombatPending =
    isRealMode() &&
    routeSummaryReady &&
    expectsPlayerMatchStats &&
    statsCharacterReports.length > 0 &&
    playerMatchCharacterReports.length === 0 &&
    (
      statsQuery.isPending ||
      statsQuery.isFetching ||
      statsDto?.playerMatchCharacterStatsMeta?.status === 'partial'
    ) &&
    statsCharacterReports.every(
      (report) => report.avgTeamKills == null || Number.isNaN(report.avgTeamKills),
    )
  const hasCharacterStatsFallback =
    aggregateCharacterReports.length > 0 ||
    statsCharacterReports.length > 0 ||
    recentCharacterReports.length > 0 ||
    playerMatchCharacterReports.length > 0
  const characterStatsPending = isRealMode()
    ? !routeSummaryReady ||
      characterStatsOwnerPending ||
      officialSparseCombatPending ||
      (
        characterReports.length === 0 &&
        !hasCharacterStatsFallback &&
        (
          (statsDto == null && (statsQuery.isPending || statsQuery.isFetching)) ||
          (
            aggregateCharacterStatsShouldWait ||
            (seasonAggregateQuery.isPending && seasonAggregateQuery.data === undefined) ||
            aggregateIsWarming
          )
        )
      )
    : matchesQuery.isPending || matchesQuery.isFetching
  const recordsMatchesError = isRealMode() && isViewingCurrentSeason && matchesQuery.isError
  const recordsMatchesErrorObj = matchesQuery.error
  const recordsHasNextPage =
    isRealMode() && isViewingCurrentSeason ? (matchesQuery.hasNextPage ?? false) : false
  const recordsMatchesEmptyMessage = isRealMode()
    ? !isViewingCurrentSeason
      ? PAST_SEASON_RECORDS_NOTICE
      : matchesQuery.isSuccess && matchItems.length === 0
        ? matchHistoryFilteredEmptyMessage(recordsMatchMode)
        : null
    : null

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
      <ProfileHero
        summary={safeSummary}
        rankingPosition={rankingPosition}
        selectedTier={seasonSnapshot?.tier ?? summary.tier}
        showRankDetails={false}
        rp={seasonSnapshot?.rank.rp ?? rp}
        onRefresh={() => void refreshProfile()}
        isRefreshing={isProfileRefreshing}
        refreshError={profileRefreshError}
        refreshStatusMessage={profileRefreshStatusMessage}
        freshnessLabel={profileFreshnessLabel}
        canRefresh={canRefreshProfile}
      />

      {isRealMode() &&
      shouldShowQuerySectionError(currentSeasonsQuery) &&
      pastSeasonsHasError &&
      seasonHistory.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          {PROFILE_SEASONS_SECTION_ERROR}
        </p>
      ) : null}

      {isRealMode() && shouldShowQuerySectionError(statsQuery) ? (
        <p className="text-muted-foreground text-sm" role="status">
          {PROFILE_STATS_SECTION_ERROR}
        </p>
      ) : null}

      {seasonsLoading ? (
        <div className="grid grid-cols-6 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 lg:flex-nowrap">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-7 rounded-md sm:h-8 sm:w-16" />
          ))}
        </div>
      ) : (
        <SeasonHistoryGrid
          seasons={seasonHistory}
          selectedSeason={selectedSeason}
          currentSeason={currentSeasonId}
          disablePastSeasonSelection={isRealMode()}
          onSelect={handleSeasonChange}
          className="w-full"
        />
      )}

      <ProfileTabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div role="tabpanel" aria-label={activeTab === 'records' ? '전적' : '분석'}>
        {activeTab === 'records' ? (
          seasonSnapshot ? (
            <ProfileRecordsTab
              seasonSnapshot={seasonSnapshot}
              rpTrend={rpTrend}
              rpChart={rpChart}
              showRpTrend={showRpTrend}
              compactSummary={compactSummary}
              overallReport={analysisReport}
              characterReports={characterReports}
              characterStatsSeasonNumber={isRealMode() ? currentSeasonId : seasonSnapshot.seasonNumber}
              userNum={userNum}
              characterStatsMode={isRealMode() ? 'real' : 'mock'}
              characterStatsBasisCount={characterStatsBasisCount}
              characterStatsSourceLabel={characterStatsSourceLabel}
              characterStatsRefreshNotice={characterStatsRefreshNotice}
              characterStatsRefreshPending={seasonAggregateEnabled && seasonAggregateQuery.isFetching}
              onRefreshCharacterStats={
                seasonAggregateEnabled ? () => void seasonAggregateQuery.refetch() : undefined
              }
              characterStatsPending={characterStatsPending}
              matchItems={matchItems}
              matchesSource={matchesSource}
              matchesPending={recordsMatchesPending}
              matchesError={recordsMatchesError}
              matchesErrorObj={recordsMatchesErrorObj}
              hasNextPage={recordsHasNextPage}
              isFetchingNextPage={matchesQuery.isFetchingNextPage}
              onLoadMore={() => void matchesQuery.fetchNextPage()}
              matchHistoryMode={recordsMatchMode}
              onMatchHistoryModeChange={setRecordsMatchMode}
              matchesEmptyMessage={recordsMatchesEmptyMessage}
            />
          ) : (
            <EmptyState title="시즌 기록이 없습니다." />
          )
        ) : seasonSnapshot ? (
          isRealMode() && !isViewingCurrentSeason ? (
            <p className="text-muted-foreground text-sm" role="status">
              {PAST_SEASON_ANALYSIS_UNAVAILABLE}
            </p>
          ) : (
          <ProfileAnalysisTab
            nickname={safeSummary.nickname}
            analysisReport={analysisReport}
            analysisCharacterReports={analysisCharacterReports}
            analysisMatches={analysisMatches}
            populationMatchSets={populationMatchSets}
            tierPopulationMatchSets={tierPopulationMatchSets}
            populationMatches={populationMatches}
            analysisBasisLabel={analysisBasisLabel}
            analysisTabMeta={analysisTabMeta}
            characterStatsBasisLabel={characterStatsSourceLabel ?? undefined}
            productionAxes={statsDto?.overallAnalysisAxes ?? null}
            teamPerformanceSummary={statsDto?.teamPerformanceSummary ?? analysisReport?.teamPerformanceSummary ?? null}
            analysisEligibility={realProfileAnalysis?.analysisEligibility ?? null}
            analysisSeasonMatches={realProfileAnalysis?.analysisSeasonMatches}
            acceptLoadedSeasonFallback={realProfileAnalysis?.acceptLoadedSeasonFallback ?? false}
            seasonNumber={currentSeasonId}
            analysisScope={analysisScope}
            onAnalysisScopeChange={setAnalysisScope}
            showAnalysisScopeToggle={showAnalysisScopeToggle}
            playStyleAnalysis={playStyleAnalysis}
            profileOwnerKey={profileIdentity.profileOwnerKey}
            playerAnalysis={playerAnalysisData}
          />
          )
        ) : (
          <EmptyState title="시즌 기록이 없습니다." />
        )}
      </div>

      <ProfilePageDebug
        nickname={nickname}
        summary={queryPhase(summaryQuery)}
        stats={queryPhase(statsQuery)}
        seasons={queryPhase(currentSeasonsQuery)}
        matches={queryPhase(matchesQuery)}
        selectedSeason={selectedSeason}
        regression={profileRegressionDebug}
      />
    </div>
  )
}
