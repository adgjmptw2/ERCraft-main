import { useQuery } from '@tanstack/react-query'

import { fetchAllMatchDTOHistory } from '@/api/player'
import { isRealMode } from '@/api/erClient'
import { ApiError } from '@/utils/apiError'
import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

/**
 * @deprecated 37단계 — 자동 전 페이지 수집 금지. useMatchDTOHistory + useLoadAdditionalMatchPages 사용.
 */
export function useAllMatchDTOHistory(nickname: string, userNum?: number | null) {
  const term = nickname.trim()
  const ownerScope = playerQueryOwnerScope({
    nickname: term,
    userNum,
    dataSource: isRealMode() ? 'real' : 'demo',
  })
  return useQuery({
    queryKey: playerQueryKeys.matchesDtoPrefix(ownerScope),
    queryFn: () => fetchAllMatchDTOHistory(term),
    enabled: false,
    staleTime: 5 * 60_000,
    retry: (failureCount, error) =>
      failureCount < 2 && error instanceof ApiError && error.code === 'RATE_LIMITED',
    retryDelay: 1_500,
  })
}
