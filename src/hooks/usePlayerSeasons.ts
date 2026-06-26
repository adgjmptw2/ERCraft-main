import { useQuery } from '@tanstack/react-query'

import { fetchPlayerSeasons } from '@/api/player'
import { ApiError } from '@/utils/apiError'
import { playerQueryKeys, type PlayerQueryOwnerScope } from '@/utils/playerQueryKeys'

/** from/to — UI 표시 시즌 범위. 호출 측에서 명시적으로 지정 */
export function usePlayerSeasons(
  scope: PlayerQueryOwnerScope,
  from: number,
  to: number,
  enabled = true,
) {
  const term = scope.nickname.trim()
  return useQuery({
    queryKey: playerQueryKeys.seasons(scope, from, to),
    queryFn: async ({ signal }) => {
      const res = await fetchPlayerSeasons(term, from, to, { signal })
      return res.data
    },
    enabled: enabled && term.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (failureCount, error) =>
      failureCount < 2 && error instanceof ApiError && error.code === 'RATE_LIMITED',
    retryDelay: 1_500,
  })
}
