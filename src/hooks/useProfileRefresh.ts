import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  fetchMatchDTOHistory,
  fetchPlayerByNickname,
  fetchPlayerStatsDTO,
} from '@/api/player'
import { isRealMode } from '@/api/erClient'
import { MATCHES_DTO_PAGE_SIZE } from '@/hooks/useMatchDTOHistory'
import { mapProfileRefreshErrorToUserMessage } from '@/utils/profileRefreshErrorMessage'
import {
  assertStatsWriteIdentity,
  assertSummaryWriteIdentity,
  resolveStatsDtoPayload,
} from '@/utils/profileCacheWriteGuard'
import {
  normalizePlayerNickname,
  playerQueryKeys,
  playerQueryOwnerScope,
  type PlayerDataSource,
  type PlayerQueryOwnerScope,
} from '@/utils/playerQueryKeys'
import { parseRefreshTimestamp, formatProfileFreshnessLabel } from '@/utils/refreshTimeLabel'
import type { ProfileRefreshMeta } from '@/types/api'
import type { MatchHistoryMode } from '@/types/matchMode'
import type { PlayerStatsDTOOptions } from '@/hooks/usePlayerStatsDTO'

function formatProfileRefreshStatusMessage(
  meta: ProfileRefreshMeta | null | undefined,
): string | null {
  if (!meta) return null
  if (meta.partialFailure) {
    return '일부 데이터 갱신에 실패했습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (meta.backgroundRefreshPending && meta.coreRefreshCompleted) {
    return meta.newGamesInserted > 0
      ? `새 경기 ${meta.newGamesInserted}건 반영 (세부 통계는 백그라운드 갱신 중)`
      : '이미 최신 상태입니다'
  }
  if (meta.newGamesInserted > 0) {
    return `새 경기 ${meta.newGamesInserted}건 반영`
  }
  if (meta.skipReason === 'upstream-game-list-stale') {
    return '상위 API에서 최신 경기를 아직 제공하지 않습니다'
  }
  if (meta.skipReason === 'no-new-games' || meta.skipReason === 'already-ingested') {
    return '이미 최신 상태입니다'
  }
  return '이미 최신 상태입니다'
}

const CORE_REFETCH_POLL_MS = 50
const CORE_REFETCH_TIMEOUT_MS = 12_000

async function waitForCoreRefreshQueriesIdle(
  queryClient: ReturnType<typeof useQueryClient>,
  ownerScope: PlayerQueryOwnerScope,
  summaryPendingScope: PlayerQueryOwnerScope,
  matchMode: MatchHistoryMode,
): Promise<'complete' | 'partial'> {
  const started = Date.now()

  for (;;) {
    const matchesFetching =
      queryClient.isFetching({
        queryKey: playerQueryKeys.matchesDto(ownerScope, MATCHES_DTO_PAGE_SIZE, matchMode),
      }) > 0
    const summaryFetching =
      queryClient.isFetching({ queryKey: playerQueryKeys.summary(summaryPendingScope) }) > 0
    const statsFetching =
      queryClient.isFetching({ queryKey: playerQueryKeys.statsDtoPrefix(ownerScope) }) > 0
    if (!matchesFetching && !summaryFetching && !statsFetching) return 'complete'
    if (Date.now() - started > CORE_REFETCH_TIMEOUT_MS) return 'partial'
    await new Promise((resolve) => setTimeout(resolve, CORE_REFETCH_POLL_MS))
  }
}

function resolveConfirmedOwnerScope(
  nickname: string,
  dataSource: PlayerDataSource,
  userNum: number | null | undefined,
): PlayerQueryOwnerScope {
  return playerQueryOwnerScope({
    nickname,
    dataSource,
    userNum: userNum != null && userNum > 0 ? userNum : null,
  })
}

function resolveRefreshModes(matchMode: MatchHistoryMode): MatchHistoryMode[] {
  if (matchMode === 'all') return ['all']
  return [matchMode, 'all']
}

export interface UseProfileRefreshOptions {
  initialLastRefreshedAt?: string | null
  initialLastCheckedAt?: string | null
  navigationKey?: string
  matchMode?: MatchHistoryMode
  seasonId?: number
  dataSource?: PlayerDataSource
  ownerScope?: PlayerQueryOwnerScope
  statsDtoOptions?: PlayerStatsDTOOptions
  onManualRefreshStart?: () => void
  onManualRefreshEnd?: (success: boolean, context: { term: string; navigationKey: string }) => void
}

export interface UseProfileRefreshResult {
  refresh: () => Promise<void>
  isRefreshing: boolean
  manualRefreshActive: boolean
  lastRefreshedAt: Date | null
  freshnessLabel: string | null
  refreshError: string | null
  refreshStatusMessage: string | null
  lastRefreshMeta: ProfileRefreshMeta | null
  clearRefreshError: () => void
  canRefresh: boolean
}

export function useProfileRefresh(
  nickname: string,
  options?: UseProfileRefreshOptions,
): UseProfileRefreshResult {
  const queryClient = useQueryClient()
  const term = normalizePlayerNickname(nickname)
  const navigationKey = options?.navigationKey ?? ''
  const matchMode = options?.matchMode ?? 'all'
  const seasonId = options?.seasonId
  const dataSource = options?.dataSource ?? (isRealMode() ? 'real' : 'demo')
  const inFlightRef = useRef(false)
  const activeNavigationKeyRef = useRef(navigationKey)

  useLayoutEffect(() => {
    activeNavigationKeyRef.current = navigationKey
  }, [navigationKey])

  useLayoutEffect(() => {
    setRefreshError(null)
    setRefreshStatusMessage(null)
  }, [term, navigationKey])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [manualRefreshActive, setManualRefreshActive] = useState(false)
  const [lastRefreshedOverride, setLastRefreshedOverride] = useState<{
    term: string
    at: Date
  } | null>(null)
  const [lastCheckedOverride, setLastCheckedOverride] = useState<{
    term: string
    at: Date
  } | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshStatusMessage, setRefreshStatusMessage] = useState<string | null>(null)
  const [lastRefreshMeta, setLastRefreshMeta] = useState<ProfileRefreshMeta | null>(null)

  const canRefresh = isRealMode() && term.length > 0
  const initialLastRefreshedAt = parseRefreshTimestamp(options?.initialLastRefreshedAt)
  const initialLastCheckedAt = parseRefreshTimestamp(options?.initialLastCheckedAt)
  const lastRefreshedAt =
    lastRefreshedOverride?.term === term ? lastRefreshedOverride.at : initialLastRefreshedAt
  const lastCheckedAt =
    lastCheckedOverride?.term === term ? lastCheckedOverride.at : initialLastCheckedAt
  const freshnessLabel = formatProfileFreshnessLabel(lastRefreshedAt, lastCheckedAt)

  const refresh = useCallback(async () => {
    if (!canRefresh || inFlightRef.current) return

    const refreshNavigationKey = navigationKey
    const refreshTerm = term
    const refreshExpectedUserNum = options?.statsDtoOptions?.userNum ?? null
    const refreshOwnerScope =
      options?.ownerScope ??
      resolveConfirmedOwnerScope(refreshTerm, dataSource, refreshExpectedUserNum)
    const summaryPendingScope = playerQueryOwnerScope({
      nickname: refreshTerm,
      dataSource,
      userNum: null,
    })
    const writeCtx = {
      refreshNavigationKey,
      activeNavigationKey: activeNavigationKeyRef.current,
      expectedUserNum: refreshExpectedUserNum,
      expectedNickname: refreshTerm,
    }

    inFlightRef.current = true
    setIsRefreshing(true)
    setManualRefreshActive(true)
    setRefreshError(null)
    setRefreshStatusMessage(null)
    options?.onManualRefreshStart?.()

    let succeeded = false
    try {
      const refreshOpts = { refresh: true as const }
      const refreshUserNum = refreshOwnerScope.userNum ?? refreshExpectedUserNum ?? undefined
      const refreshIdentityOpts = {
        ...refreshOpts,
        userNum: refreshUserNum,
      }
      const refreshModes = resolveRefreshModes(matchMode)

      const modeResults = await Promise.all(
        refreshModes.map((mode) =>
          fetchMatchDTOHistory(refreshTerm, 0, MATCHES_DTO_PAGE_SIZE, {
            ...refreshIdentityOpts,
            matchMode: mode,
          }),
        ),
      )
      const matchesByMode = new Map<MatchHistoryMode, (typeof modeResults)[number]>()
      refreshModes.forEach((mode, index) => {
        matchesByMode.set(mode, modeResults[index]!)
      })
      const matchesResult = matchesByMode.get(matchMode) ?? modeResults[0]!

      const [summaryRes, statsRes] = await Promise.all([
        fetchPlayerByNickname(refreshTerm, refreshIdentityOpts),
        fetchPlayerStatsDTO(refreshTerm, { ...options?.statsDtoOptions, ...refreshIdentityOpts }),
      ])

      if (activeNavigationKeyRef.current !== refreshNavigationKey) {
        return
      }

      const confirmedUserNum = summaryRes.data?.userNum ?? refreshExpectedUserNum
      const confirmedScope = resolveConfirmedOwnerScope(refreshTerm, dataSource, confirmedUserNum)

      if (assertSummaryWriteIdentity(summaryRes.data, writeCtx)) {
        queryClient.setQueryData(playerQueryKeys.summary(summaryPendingScope), summaryRes.data)
      }

      if (assertStatsWriteIdentity(resolveStatsDtoPayload(statsRes), writeCtx)) {
        const tierKey = isRealMode() ? '' : (options?.statsDtoOptions?.tier ?? '')
        queryClient.setQueryData(playerQueryKeys.statsDto(confirmedScope, tierKey), statsRes)
      }

      if (assertSummaryWriteIdentity(summaryRes.data, writeCtx)) {
        queryClient.setQueryData(
          playerQueryKeys.matchesDto(confirmedScope, MATCHES_DTO_PAGE_SIZE, matchMode),
          {
            pages: [matchesResult],
            pageParams: [0],
          },
        )
        for (const mode of refreshModes) {
          if (mode === matchMode) continue
          const modeResult = matchesByMode.get(mode)
          if (!modeResult) continue
          queryClient.setQueryData(
            playerQueryKeys.matchesDto(confirmedScope, MATCHES_DTO_PAGE_SIZE, mode),
            {
              pages: [modeResult],
              pageParams: [0],
            },
          )
        }
      }

      if (activeNavigationKeyRef.current !== refreshNavigationKey) {
        return
      }

      void queryClient.invalidateQueries({
        queryKey: playerQueryKeys.seasonsPrefix(confirmedScope),
        refetchType: 'none',
      })
      if (seasonId != null && seasonId > 0) {
        void queryClient.invalidateQueries({
          queryKey: playerQueryKeys.seasonAggregate(confirmedScope, seasonId),
          refetchType: 'none',
        })
        void queryClient.invalidateQueries({
          queryKey: playerQueryKeys.analysisPrefix(confirmedScope),
          refetchType: 'active',
        })
      }

      const coreIdle = await waitForCoreRefreshQueriesIdle(
        queryClient,
        confirmedScope,
        summaryPendingScope,
        matchMode,
      )

      const refreshMeta = matchesResult.profileRefresh ?? null
      setLastRefreshMeta(refreshMeta)
      const statusMessage = formatProfileRefreshStatusMessage(refreshMeta)
      if (refreshMeta?.partialFailure) {
        setRefreshError(statusMessage)
      } else if (coreIdle === 'partial') {
        setRefreshStatusMessage('핵심 전적은 반영됐지만 일부 화면 갱신이 지연되고 있습니다.')
      } else {
        setRefreshStatusMessage(statusMessage)
      }

      const completedAt = parseRefreshTimestamp(refreshMeta?.refreshCompletedAt) ?? new Date()
      if (
        refreshTerm === term &&
        refreshNavigationKey === activeNavigationKeyRef.current
      ) {
        setLastRefreshedOverride({ term: refreshTerm, at: completedAt })
        setLastCheckedOverride({ term: refreshTerm, at: completedAt })
      }
      succeeded = !refreshMeta?.partialFailure
    } catch (error) {
      if (refreshNavigationKey === activeNavigationKeyRef.current) {
        setRefreshError(mapProfileRefreshErrorToUserMessage(error))
      }
    } finally {
      inFlightRef.current = false
      setIsRefreshing(false)
      setManualRefreshActive(false)
      if (
        refreshTerm === term &&
        refreshNavigationKey === activeNavigationKeyRef.current
      ) {
        options?.onManualRefreshEnd?.(succeeded, {
          term: refreshTerm,
          navigationKey: refreshNavigationKey,
        })
      }
    }
  }, [canRefresh, dataSource, matchMode, navigationKey, options, queryClient, seasonId, term])

  const clearRefreshError = useCallback(() => {
    setRefreshError(null)
    setRefreshStatusMessage(null)
  }, [])

  return {
    refresh,
    isRefreshing,
    manualRefreshActive,
    lastRefreshedAt,
    freshnessLabel,
    refreshError,
    refreshStatusMessage,
    lastRefreshMeta,
    clearRefreshError,
    canRefresh,
  }
}
