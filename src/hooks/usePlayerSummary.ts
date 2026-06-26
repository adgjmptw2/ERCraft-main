import { useQuery } from '@tanstack/react-query'

import { fetchPlayerByNickname } from '@/api/player'
import { ApiError } from '@/utils/apiError'
import {
  playerQueryKeys,
  playerQueryOwnerScope,
  type PlayerDataSource,
} from '@/utils/playerQueryKeys'

export function usePlayerSummary(nickname: string, dataSource: PlayerDataSource = 'real') {
  const term = nickname.trim()
  const scope = playerQueryOwnerScope({ nickname: term, dataSource })
  return useQuery({
    queryKey: playerQueryKeys.summary(scope),
    queryFn: async ({ signal }) => {
      const res = await fetchPlayerByNickname(term, { signal })
      return res.data
    },
    enabled: term.length > 0,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (failureCount, error) =>
      failureCount < 2 && error instanceof ApiError && error.code === 'RATE_LIMITED',
    retryDelay: 1_500,
  })
}
