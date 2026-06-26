import { useInfiniteQuery } from '@tanstack/react-query'

import { fetchMatchDTOHistory } from '@/api/player'
import type { MatchHistoryMode } from '@/types/matchMode'
import { ApiError } from '@/utils/apiError'
import { playerQueryKeys, type PlayerQueryOwnerScope } from '@/utils/playerQueryKeys'

export const MATCHES_DTO_PAGE_SIZE = 10

export function useMatchDTOHistory(
  scope: PlayerQueryOwnerScope,
  enabled = true,
  matchMode: MatchHistoryMode = 'all',
) {
  const term = scope.nickname.trim()
  return useInfiniteQuery({
    queryKey: playerQueryKeys.matchesDto(scope, MATCHES_DTO_PAGE_SIZE, matchMode),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchMatchDTOHistory(term, pageParam, MATCHES_DTO_PAGE_SIZE, {
        matchMode,
        userNum: scope.userNum ?? undefined,
        signal,
      }),
    getNextPageParam: (lastPage) => {
      if (!lastPage.data.hasNext) return undefined
      return lastPage.data.page + 1
    },
    enabled: enabled && term.length > 0,
    staleTime: 120_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (failureCount, error) =>
      failureCount < 2 && error instanceof ApiError && error.code === 'RATE_LIMITED',
    retryDelay: 1_500,
  })
}
