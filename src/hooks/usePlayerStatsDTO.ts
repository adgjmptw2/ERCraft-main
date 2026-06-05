import { useQuery } from '@tanstack/react-query'

import { fetchPlayerStatsDTO } from '@/api/player'

export function usePlayerStatsDTO(userNum: number, tier?: string) {
  return useQuery({
    queryKey: ['player', 'stats-dto', userNum, tier ?? ''],
    queryFn: () => fetchPlayerStatsDTO(userNum, tier ? { tier } : undefined),
    enabled: userNum > 0,
  })
}
