import { useQuery } from '@tanstack/react-query'

import { fetchPlayerStats } from '@/api/player'
import { isRealMode } from '@/api/erClient'
import { normalizePlayerNickname, playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

export function usePlayerStats(nickname: string, userNum?: number | null) {
  const term = normalizePlayerNickname(nickname)
  const ownerScope = playerQueryOwnerScope({
    nickname: term,
    userNum,
    dataSource: isRealMode() ? 'real' : 'demo',
  })
  return useQuery({
    queryKey: playerQueryKeys.stats(ownerScope),
    queryFn: () => fetchPlayerStats(term),
    enabled: term.length > 0,
  })
}
