import { useEffect, useMemo, useRef } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import { isRealMode } from '@/api/erClient'
import { DEMO_LATEST_SEASON } from '@/mocks/loader'
import type { DemoSeasonRecord } from '@/mocks/seasonHistory'
import { useDeferredProfileInitialReady } from '@/hooks/useDeferredProfileInitialReady'
import { usePlayerSeasons } from '@/hooks/usePlayerSeasons'
import type { ProfileIdentity } from '@/hooks/useProfileIdentity'
import type { PlayerSummary } from '@/types/player'
import { playerSeasonToDemoRecord } from '@/types/season'
import type { PlayerSeasonsResponse } from '@/types/season'
import { mergeSeasonsResponses } from '@/utils/mergeSeasonsResponses'
import { gateSeasonsPayload } from '@/utils/profileOwnerGate'
import {
  buildFallbackSeasonRecord,
  shouldRefetchSeasonsDueToRankDrift,
} from '@/utils/profileSeasonFallback'
import { playerQueryKeys, playerQueryOwnerScope, type PlayerDataSource } from '@/utils/playerQueryKeys'
import type { PlayerStatsDTO } from '@/types/player'

const PAST_SEASONS_INITIAL_DEFER_MS = import.meta.env.MODE === 'test' ? 30 : 800

export type ProfileSeasonsDisplayState =
  | 'idle'
  | 'loading-current'
  | 'loading-history'
  | 'ready'
  | 'empty'
  | 'error'

export interface UseProfileSeasonsHandoffParams {
  identity: ProfileIdentity
  profileDataEnabled: boolean
  summary: PlayerSummary | undefined
  queryClient: QueryClient
  statsDto: PlayerStatsDTO | null
  dataSource: PlayerDataSource
}

export interface UseProfileSeasonsHandoffResult {
  seasonsApiData: PlayerSeasonsResponse | undefined
  seasonHistory: DemoSeasonRecord[]
  seasonsDisplayState: ProfileSeasonsDisplayState
  seasonsLoading: boolean
  pastSeasonsHasError: boolean
  currentSeasonsQuery: ReturnType<typeof usePlayerSeasons>
  pastSeasonsQuery: ReturnType<typeof usePlayerSeasons>
  fullSeasonsQuery: ReturnType<typeof usePlayerSeasons>
  fullRangeSeasonsEnabled: boolean
  pastSeasonsRangeEnabled: boolean
  identityHandoffSeasonsQueryKey: string
  identityHandoffSeasonsEnabled: boolean
  apiCurrentSeason: number
}

export function useProfileSeasonsHandoff(
  params: UseProfileSeasonsHandoffParams,
): UseProfileSeasonsHandoffResult {
  const { identity, profileDataEnabled, summary, queryClient, statsDto, dataSource } = params
  const profileTerm = identity.routeNicknameRaw.trim()
  const currentSeasonForQuery = summary?.currentSeason ?? DEMO_LATEST_SEASON
  const canonicalUserNum = identity.canonicalUserNum
  const ownerScope = playerQueryOwnerScope({
    nickname: profileTerm,
    userNum: canonicalUserNum,
    dataSource,
  })

  const initialProfileReadyKey =
    profileDataEnabled && identity.phase === 'ready' && canonicalUserNum != null
      ? `${identity.navigationKey}:${identity.normalizedNickname}:${canonicalUserNum}`
      : null

  const hasProfileCache = identity.routeSummaryReady && summary?.hasProfileCache === true
  const hasStoredSeasonHistory =
    identity.routeSummaryReady && summary?.hasStoredSeasonHistory === true

  const hasCachedSeasons =
    initialProfileReadyKey != null &&
    (hasProfileCache ||
      hasStoredSeasonHistory ||
      queryClient
        .getQueriesData({ queryKey: playerQueryKeys.seasonsPrefix(ownerScope) })
        .some(([, data]) => {
          if (data == null || canonicalUserNum == null) return false
          const seasons = data as PlayerSeasonsResponse
          if (!seasons.owner) return false
          return seasons.owner.userNum === canonicalUserNum
        }))

  const pastSeasonsInitialReady = useDeferredProfileInitialReady(
    initialProfileReadyKey,
    hasCachedSeasons,
    PAST_SEASONS_INITIAL_DEFER_MS,
  )

  const seasonsQueryBaseEnabled = profileDataEnabled && isRealMode()

  const fullRangeSeasonsEnabled =
    seasonsQueryBaseEnabled &&
    identity.routeSummaryReady &&
    (hasProfileCache || hasStoredSeasonHistory) &&
    currentSeasonForQuery >= 1

  const currentSeasonsQuery = usePlayerSeasons(
    ownerScope,
    currentSeasonForQuery,
    currentSeasonForQuery,
    seasonsQueryBaseEnabled && !fullRangeSeasonsEnabled && isRealMode(),
  )

  const fullSeasonsQuery = usePlayerSeasons(
    ownerScope,
    1,
    currentSeasonForQuery,
    fullRangeSeasonsEnabled,
  )

  const pastSeasonsTo = Math.max(1, currentSeasonForQuery - 1)
  const pastSeasonsRangeEnabled =
    seasonsQueryBaseEnabled &&
    !fullRangeSeasonsEnabled &&
    identity.routeSummaryReady &&
    canonicalUserNum != null &&
    (hasProfileCache || hasStoredSeasonHistory || pastSeasonsInitialReady) &&
    (hasProfileCache || hasStoredSeasonHistory || currentSeasonsQuery.isSuccess) &&
    currentSeasonForQuery > 1

  const pastSeasonsQuery = usePlayerSeasons(
    ownerScope,
    1,
    pastSeasonsTo,
    pastSeasonsRangeEnabled,
  )

  const gatedCurrent = useMemo(
    () =>
      gateSeasonsPayload(
        currentSeasonsQuery.data,
        identity.normalizedNickname,
        canonicalUserNum,
        currentSeasonForQuery,
        currentSeasonForQuery,
      ),
    [
      canonicalUserNum,
      currentSeasonForQuery,
      currentSeasonsQuery.data,
      identity.normalizedNickname,
    ],
  )

  const gatedPast = useMemo(
    () =>
      gateSeasonsPayload(
        pastSeasonsQuery.data,
        identity.normalizedNickname,
        canonicalUserNum,
        1,
        pastSeasonsTo,
      ),
    [canonicalUserNum, identity.normalizedNickname, pastSeasonsQuery.data, pastSeasonsTo],
  )

  const gatedFull = useMemo(
    () =>
      gateSeasonsPayload(
        fullSeasonsQuery.data,
        identity.normalizedNickname,
        canonicalUserNum,
        1,
        currentSeasonForQuery,
      ),
    [
      canonicalUserNum,
      currentSeasonForQuery,
      fullSeasonsQuery.data,
      identity.normalizedNickname,
    ],
  )

  const seasonsApiData = useMemo(() => {
    if (!identity.routeSummaryReady || canonicalUserNum == null) return undefined
    if (fullRangeSeasonsEnabled) return gatedFull
    return mergeSeasonsResponses(gatedPast, gatedCurrent)
  }, [
    canonicalUserNum,
    fullRangeSeasonsEnabled,
    gatedCurrent,
    gatedFull,
    gatedPast,
    identity.routeSummaryReady,
  ])

  const historyExpected =
    isRealMode() &&
    identity.routeSummaryReady &&
    !fullRangeSeasonsEnabled &&
    currentSeasonForQuery > 1

  const seasonsDisplayState = useMemo((): ProfileSeasonsDisplayState => {
    if (!isRealMode() || !profileDataEnabled) return 'idle'
    if (!identity.routeSummaryReady || canonicalUserNum == null) return 'idle'

    if (fullRangeSeasonsEnabled) {
      if ((fullSeasonsQuery.isPending || fullSeasonsQuery.isFetching) && !gatedFull) {
        return 'loading-history'
      }
      if (fullSeasonsQuery.isError) return 'error'
      if (gatedFull && gatedFull.seasons.length > 0) return 'ready'
      return gatedFull ? 'empty' : 'loading-history'
    }

    if (currentSeasonsQuery.isPending && !gatedCurrent) return 'loading-current'
    if (currentSeasonsQuery.isError && !gatedCurrent) return 'error'

    if (historyExpected) {
      if (!pastSeasonsRangeEnabled) {
        if (currentSeasonsQuery.isSuccess && gatedCurrent) return 'loading-history'
        return currentSeasonsQuery.isPending ? 'loading-current' : 'loading-history'
      }
      if ((pastSeasonsQuery.isPending || pastSeasonsQuery.isFetching) && !gatedPast) {
        return 'loading-history'
      }
      if (pastSeasonsQuery.isError && !gatedPast && !gatedCurrent) return 'error'
    }

    if (seasonsApiData && seasonsApiData.seasons.some((season) => season.played)) {
      return 'ready'
    }
    if (currentSeasonsQuery.isSuccess && gatedCurrent) return 'ready'
    if (currentSeasonsQuery.isError || pastSeasonsQuery.isError) return 'error'
    return 'empty'
  }, [
    canonicalUserNum,
    currentSeasonsQuery.isError,
    currentSeasonsQuery.isPending,
    currentSeasonsQuery.isSuccess,
    fullRangeSeasonsEnabled,
    fullSeasonsQuery.isError,
    fullSeasonsQuery.isFetching,
    fullSeasonsQuery.isPending,
    gatedCurrent,
    gatedFull,
    gatedPast,
    historyExpected,
    identity.routeSummaryReady,
    pastSeasonsQuery.isError,
    pastSeasonsQuery.isFetching,
    pastSeasonsQuery.isPending,
    pastSeasonsRangeEnabled,
    profileDataEnabled,
    seasonsApiData,
  ])

  const apiCurrentSeason = isRealMode()
    ? (seasonsApiData?.currentSeason ?? summary?.currentSeason ?? DEMO_LATEST_SEASON)
    : DEMO_LATEST_SEASON

  const rankDriftRefetchRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isRealMode() || !summary || !seasonsApiData || !identity.routeSummaryReady) return
    if (
      !shouldRefetchSeasonsDueToRankDrift(summary, seasonsApiData, apiCurrentSeason)
    ) {
      return
    }
    const driftKey = `${identity.navigationKey}:${profileTerm}:${apiCurrentSeason}`
    if (rankDriftRefetchRef.current === driftKey) return
    rankDriftRefetchRef.current = driftKey
    void queryClient.invalidateQueries({
      queryKey: playerQueryKeys.seasonsPrefix(ownerScope),
      refetchType: 'active',
    })
  }, [
    apiCurrentSeason,
    identity.navigationKey,
    identity.routeSummaryReady,
    profileTerm,
    queryClient,
    seasonsApiData,
    summary,
  ])

  const seasonHistory = useMemo((): DemoSeasonRecord[] => {
    if (!isRealMode()) {
      return canonicalUserNum != null && canonicalUserNum > 0
        ? []
        : []
    }
    if (!identity.routeSummaryReady || canonicalUserNum == null) return []
    if (
      seasonsDisplayState === 'idle' ||
      seasonsDisplayState === 'loading-current' ||
      seasonsDisplayState === 'loading-history'
    ) {
      return []
    }

    const fromApi = (seasonsApiData?.seasons ?? [])
      .filter((season) => season.played)
      .map(playerSeasonToDemoRecord)
    if (fromApi.length > 0) return fromApi

    if (seasonsDisplayState === 'ready' && summary) {
      const seasonNumber = apiCurrentSeason
      return [buildFallbackSeasonRecord(summary, seasonNumber, statsDto)]
    }
    return []
  }, [
    apiCurrentSeason,
    canonicalUserNum,
    identity.routeSummaryReady,
    seasonsApiData,
    seasonsDisplayState,
    statsDto,
    summary,
  ])

  const seasonsLoading =
    seasonsDisplayState === 'loading-current' || seasonsDisplayState === 'loading-history'

  const pastSeasonsHasError = isRealMode() && pastSeasonsQuery.isError

  const identityHandoffSeasonsQueryKey = fullRangeSeasonsEnabled
    ? `seasons:1-${currentSeasonForQuery}:full`
    : pastSeasonsRangeEnabled
      ? `seasons:1-${pastSeasonsTo}:past`
      : `seasons:${currentSeasonForQuery}-${currentSeasonForQuery}:current`

  const identityHandoffSeasonsEnabled =
    fullRangeSeasonsEnabled || pastSeasonsRangeEnabled || currentSeasonsQuery.isFetching

  return {
    seasonsApiData,
    seasonHistory,
    seasonsDisplayState,
    seasonsLoading,
    pastSeasonsHasError,
    currentSeasonsQuery,
    pastSeasonsQuery,
    fullSeasonsQuery,
    fullRangeSeasonsEnabled,
    pastSeasonsRangeEnabled,
    identityHandoffSeasonsQueryKey,
    identityHandoffSeasonsEnabled,
    apiCurrentSeason,
  }
}
