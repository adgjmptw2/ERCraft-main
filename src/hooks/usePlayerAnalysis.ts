import { useQuery } from '@tanstack/react-query'

import { getClient, isRealMode } from '@/api/erClient'
import type { PlayerFetchOptions } from '@/types/player'
import type { PlayerAnalysisResponseDTO } from '@/types/playerAnalysis'
import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

export function usePlayerAnalysis(params: {
  nickname: string
  userNum?: number | null
  seasonId: number
  enabled?: boolean
}) {
  const ownerScope = playerQueryOwnerScope({
    nickname: params.nickname,
    userNum: params.userNum,
    dataSource: isRealMode() ? 'real' : 'demo',
  })
  const fetchOptions: PlayerFetchOptions = {
    userNum: params.userNum ?? undefined,
    seasonId: params.seasonId,
  }

  return useQuery({
    queryKey: playerQueryKeys.analysis(ownerScope, params.seasonId, 'rank'),
    enabled: (params.enabled ?? true) && isRealMode() && params.seasonId > 0,
    queryFn: async (): Promise<PlayerAnalysisResponseDTO> => {
      const client = getClient()
      if (!('fetchPlayerAnalysis' in client) || typeof client.fetchPlayerAnalysis !== 'function') {
        throw new Error('Analysis API unavailable')
      }
      return client.fetchPlayerAnalysis(params.nickname, fetchOptions)
    },
    staleTime: 60_000,
  })
}

export function useInvalidatePlayerAnalysis() {
  return (nickname: string, userNum?: number | null) => {
    const ownerScope = playerQueryOwnerScope({
      nickname,
      userNum,
      dataSource: isRealMode() ? 'real' : 'demo',
    })
    return playerQueryKeys.analysisPrefix(ownerScope)
  }
}
