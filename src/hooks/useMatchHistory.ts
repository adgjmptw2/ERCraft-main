import { useInfiniteQuery } from '@tanstack/react-query'

import { fetchMatchHistory } from '@/api/player'

export function useMatchHistory(userNum: number) {
  return useInfiniteQuery({
    queryKey: ['player', 'matches', userNum],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMatchHistory(userNum, pageParam),
    getNextPageParam: (lastPage) => {
      if (!lastPage.data.hasNext) return undefined
      return lastPage.data.page + 1
    },
    enabled: userNum > 0,
  })
}
