import { useInfiniteQuery } from '@tanstack/react-query'

import { fetchMatchHistory } from '@/api/player'

const PAGE_SIZE = 10

export function useMatchHistory(userNum: number) {
  return useInfiniteQuery({
    queryKey: ['player', 'matches', userNum],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMatchHistory(userNum, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.data.length < PAGE_SIZE) return undefined
      return allPages.length
    },
    enabled: userNum > 0,
  })
}
