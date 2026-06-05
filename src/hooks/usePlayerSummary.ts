import { useQuery } from '@tanstack/react-query'

import { fetchPlayerByNickname } from '@/api/player'

export function usePlayerSummary(nickname: string) {
  return useQuery({
    queryKey: ['player', 'summary', nickname],
    queryFn: async () => {
      const res = await fetchPlayerByNickname(nickname)
      return res.data
    },
    enabled: nickname.length > 0,
  })
}
