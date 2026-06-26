import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function usePlaceholderMirrorQuery(key: string) {
  return useQuery({
    queryKey: ['player', key, 'stats-dto'],
    queryFn: async () => ({ owner: key, userNum: key === 'alice' ? 1 : 2 }),
    placeholderData: (previousData) => previousData,
  })
}

describe('usePlayerStatsDTO placeholder handoff (TanStack Query contract)', () => {
  it('query key 변경 시 placeholderData가 이전 nickname payload를 새 observer에 전달한다', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { result, rerender } = renderHook(
      ({ nickname }: { nickname: string }) => usePlaceholderMirrorQuery(nickname),
      {
        wrapper: createWrapper(client),
        initialProps: { nickname: 'alice' },
      },
    )

    await waitFor(() => {
      expect(result.current.data?.owner).toBe('alice')
    })

    rerender({ nickname: 'bob' })

    expect(result.current.data?.owner).toBe('alice')
    expect(result.current.fetchStatus).toBe('fetching')

    await waitFor(() => {
      expect(result.current.data?.owner).toBe('bob')
    })
  })
})
