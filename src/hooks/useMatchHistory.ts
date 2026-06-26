import { useInfiniteQuery } from '@tanstack/react-query'

import { fetchMatchHistory } from '@/api/player'
import { normalizePlayerNickname, playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'
import { isRealMode } from '@/api/erClient'

export function useMatchHistory(nickname: string, userNum?: number | null) {
  const term = normalizePlayerNickname(nickname)
  const ownerScope = playerQueryOwnerScope({
    nickname: term,
    userNum,
    dataSource: isRealMode() ? 'real' : 'demo',
  })
  return useInfiniteQuery({
    queryKey: playerQueryKeys.matches(ownerScope),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMatchHistory(term, pageParam),
    getNextPageParam: (lastPage) => {
      if (!lastPage.data.hasNext) return undefined
      return lastPage.data.page + 1
    },
    enabled: term.length > 0,
  })
}
