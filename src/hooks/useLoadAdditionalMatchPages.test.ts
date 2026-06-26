import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useLoadAdditionalMatchPages } from '@/hooks/useLoadAdditionalMatchPages'

describe('useLoadAdditionalMatchPages', () => {
  const fetchNextPage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enabled=false면 loadMore가 fetchNextPage를 호출하지 않음', async () => {
    const { result } = renderHook(() =>
      useLoadAdditionalMatchPages(
        { hasNextPage: true, isFetchingNextPage: false, fetchNextPage },
        false,
      ),
    )

    await act(async () => {
      await result.current.loadMore()
    })

    expect(fetchNextPage).not.toHaveBeenCalled()
  })

  it('클릭 시 fetchNextPage 호출', async () => {
    fetchNextPage.mockResolvedValueOnce({ isError: false, hasNextPage: false })

    const { result } = renderHook(() =>
      useLoadAdditionalMatchPages(
        { hasNextPage: true, isFetchingNextPage: false, fetchNextPage },
        true,
      ),
    )

    await act(async () => {
      await result.current.loadMore()
    })

    expect(fetchNextPage).toHaveBeenCalled()
  })
})
