import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import { DEMO_LATEST_SEASON } from '@/mocks/loader'
import type { PlayerSummary } from '@/types/player'
import { normalizePlayerNickname } from '@/utils/playerQueryKeys'
import {
  profileIdentityKey,
  summaryMatchesRouteNickname,
} from '@/utils/profileSeasonPolicy'

export type ProfileIdentityPhase = 'route' | 'resolving' | 'ready' | 'not-found' | 'error'

export interface ProfileIdentity {
  routeNicknameRaw: string
  normalizedNickname: string
  navigationKey: string
  canonicalUserNum: number | null
  seasonId: number
  phase: ProfileIdentityPhase
  routeSummaryReady: boolean
  profileOwnerKey: string
}

export interface ProfileSummaryQueryPhase {
  isPending: boolean
  isError: boolean
  isSuccess: boolean
}

export function useProfileIdentity(
  routeNicknameRaw: string,
  summary: PlayerSummary | undefined,
  summaryQuery: ProfileSummaryQueryPhase,
): ProfileIdentity {
  const location = useLocation()
  const normalizedNickname = normalizePlayerNickname(routeNicknameRaw)
  const routeSummaryReady = summaryMatchesRouteNickname(summary, routeNicknameRaw)
  const canonicalUserNum =
    routeSummaryReady && summary != null && summary.userNum > 0 ? summary.userNum : null

  const phase = useMemo((): ProfileIdentityPhase => {
    if (!normalizedNickname) return 'route'
    if (summaryQuery.isError) return 'error'
    if (!summary) {
      if (summaryQuery.isPending) return 'resolving'
      if (summaryQuery.isSuccess) return 'not-found'
      return 'resolving'
    }
    if (!routeSummaryReady) return 'resolving'
    return 'ready'
  }, [
    normalizedNickname,
    routeSummaryReady,
    summary,
    summaryQuery.isError,
    summaryQuery.isPending,
    summaryQuery.isSuccess,
  ])

  const seasonId = summary?.currentSeason ?? DEMO_LATEST_SEASON
  const profileOwnerKey =
    canonicalUserNum != null
      ? profileIdentityKey(routeNicknameRaw, canonicalUserNum)
      : normalizedNickname

  return {
    routeNicknameRaw,
    normalizedNickname,
    navigationKey: location.key,
    canonicalUserNum,
    seasonId,
    phase,
    routeSummaryReady,
    profileOwnerKey,
  }
}
