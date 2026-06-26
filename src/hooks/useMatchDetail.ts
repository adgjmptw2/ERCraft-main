import { useQuery } from '@tanstack/react-query'

import { fetchMatchDetail } from '@/api/matchDetail'
import { isRealMode } from '@/api/erClient'
import { ApiError } from '@/utils/apiError'
import { matchQueryKeys } from '@/utils/matchQueryKeys'

export function useMatchDetail(gameId: string, enabled: boolean) {
  const trimmed = gameId.trim()
  return useQuery({
    queryKey: matchQueryKeys.detail(trimmed),
    queryFn: async () => {
      const res = await fetchMatchDetail(trimmed)
      return res.data
    },
    enabled: enabled && isRealMode() && trimmed.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (failureCount >= 1) return false
      if (error instanceof ApiError && error.code === 'RATE_LIMITED') return false
      return true
    },
  })
}
