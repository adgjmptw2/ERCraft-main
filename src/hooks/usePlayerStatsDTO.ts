import { useQuery } from '@tanstack/react-query'

import { fetchPlayerStatsDTO } from '@/api/player'
import { isRealMode } from '@/api/erClient'
import { ApiError } from '@/utils/apiError'
import {
  playerQueryKeys,
  type PlayerQueryOwnerScope,
} from '@/utils/playerQueryKeys'

import type { NormalizedRankTier } from '@/types/player'

const SNAPSHOT_REFRESH_INTERVAL_MS = 1_500

export interface PlayerStatsDTOOptions {
  tier?: string
  userNum?: number
  normalizedTier?: NormalizedRankTier
  leaderboardRank?: number | null
  refresh?: boolean
}

function isRefreshingCharacterGradeSnapshot(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const result = data as { data?: unknown }
  if (typeof result.data !== 'object' || result.data === null) return false
  const stats = result.data as {
    playerMatchCharacterStatsMeta?: { snapshotStatus?: unknown }
  }
  return stats.playerMatchCharacterStatsMeta?.snapshotStatus === 'refreshing'
}

export function usePlayerStatsDTO(
  scope: PlayerQueryOwnerScope,
  options?: string | PlayerStatsDTOOptions,
  enabled = true,
) {
  const resolved =
    typeof options === 'string' || options === undefined
      ? { tier: typeof options === 'string' ? options : undefined }
      : options
  const term = scope.nickname.trim()
  const realMode = isRealMode()
  const tierKey = realMode ? '' : (resolved.tier ?? '')
  return useQuery({
    queryKey: playerQueryKeys.statsDto(scope, tierKey),
    queryFn: ({ signal }) => fetchPlayerStatsDTO(term, { ...resolved, signal }),
    enabled: enabled && term.length > 0 && (realMode || resolved.tier !== undefined),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: (query) =>
      isRefreshingCharacterGradeSnapshot(query.state.data) ? SNAPSHOT_REFRESH_INTERVAL_MS : false,
    retry: (failureCount, error) =>
      failureCount < 2 && error instanceof ApiError && error.code === 'RATE_LIMITED',
    retryDelay: 1_500,
  })
}
