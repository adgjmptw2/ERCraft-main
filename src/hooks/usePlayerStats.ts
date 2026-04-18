import { useQuery } from '@tanstack/react-query'

import { fetchPlayerStats } from '@/api/player'

export function usePlayerStats(userNum: number) {
  return useQuery({
    queryKey: ['player', 'stats', userNum],
    queryFn: () => fetchPlayerStats(userNum),
    enabled: userNum > 0,
  })
}
