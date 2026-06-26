import type { InfiniteData, InfiniteQueryObserverResult } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import type { ApiResult } from '@/types/api'
import type { MatchSummaryDTO, Paginated } from '@/types/match'
import { mapAdditionalMatchesErrorToUserMessage } from '@/utils/additionalMatchesErrorMessage'

/** 버튼 클릭 1회당 추가로 가져올 matches 페이지 수 */
export const MATCHES_PAGES_PER_LOAD = 2

type MatchPage = ApiResult<Paginated<MatchSummaryDTO>>

interface MatchesInfiniteQuery {
  hasNextPage?: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<InfiniteQueryObserverResult<InfiniteData<MatchPage>, Error>>
}

export function useLoadAdditionalMatchPages(matchesQuery: MatchesInfiniteQuery, enabled: boolean) {
  const [isLoadingBatch, setIsLoadingBatch] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canLoadMore = enabled && (matchesQuery.hasNextPage ?? false)
  const isBusy = isLoadingBatch || matchesQuery.isFetchingNextPage

  const loadMore = useCallback(async () => {
    if (!enabled || isBusy) return
    if (!(matchesQuery.hasNextPage ?? false)) return

    setIsLoadingBatch(true)
    setError(null)

    try {
      let pagesLeft = MATCHES_PAGES_PER_LOAD
      let result = await matchesQuery.fetchNextPage()
      if (result.isError) throw result.error ?? new Error('fetch failed')
      pagesLeft -= 1

      while (pagesLeft > 0 && result.hasNextPage) {
        result = await matchesQuery.fetchNextPage()
        if (result.isError) throw result.error ?? new Error('fetch failed')
        pagesLeft -= 1
      }
    } catch (e) {
      setError(mapAdditionalMatchesErrorToUserMessage(e))
    } finally {
      setIsLoadingBatch(false)
    }
  }, [enabled, isBusy, matchesQuery])

  const clearError = useCallback(() => setError(null), [])

  return { loadMore, canLoadMore, isBusy, error, clearError }
}
