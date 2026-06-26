import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { fetchMatchDetail } from '@/api/matchDetail'
import { isRealMode } from '@/api/erClient'
import { matchQueryKeys } from '@/utils/matchQueryKeys'

const IDLE_PREFETCH_MAX = 2
const IDLE_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 1_500

/** summary/matches 표시 이후 idle에 최근 1~2경기 detail만 prefetch (동시성 1) */
export function useIdleMatchDetailPrefetch(gameIds: readonly string[], enabled: boolean): void {
  const queryClient = useQueryClient()
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    if (!enabled || !isRealMode()) return undefined

    const targets = gameIds.filter((id) => id.trim().length > 0).slice(0, IDLE_PREFETCH_MAX)
    if (targets.length === 0) return undefined

    const timer = window.setTimeout(() => {
      void (async () => {
        for (const gameId of targets) {
          if (cancelledRef.current) return
          const key = matchQueryKeys.detail(gameId)
          const cached = queryClient.getQueryData(key)
          if (cached) continue
          await queryClient.prefetchQuery({
            queryKey: key,
            queryFn: async () => (await fetchMatchDetail(gameId)).data,
            staleTime: 10 * 60_000,
          })
        }
      })()
    }, IDLE_DELAY_MS)

    return () => {
      cancelledRef.current = true
      window.clearTimeout(timer)
    }
  }, [enabled, gameIds, queryClient])
}
