import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { usePlayerStatsDTO } from '@/hooks/usePlayerStatsDTO'
import { playerQueryOwnerScope } from '@/utils/playerQueryKeys'

vi.mock('@/api/player', () => ({
  fetchPlayerStatsDTO: vi.fn(async (nickname: string) => ({
    data: {
      userNum: nickname === 'alice' ? 1 : 2,
      games: 1,
      winRate: 0,
      avgKills: 0,
      avgPlacement: 0,
      kda: 0,
      kdaString: '0',
      mostPlayedCharacter: { name: 'x', count: 0 },
      tier: 'GOLD',
      mmr: 0,
    },
    source: 'cache',
    refreshedAt: '2026-06-19T00:00:00.000Z',
  })),
}))

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('usePlayerStatsDTO owner-safe query', () => {
  it('owner scope 변경 시 이전 nickname payload를 placeholder로 전달하지 않는다', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { result, rerender } = renderHook(
      ({ nickname, userNum }: { nickname: string; userNum: number }) =>
        usePlayerStatsDTO(
          playerQueryOwnerScope({ nickname, userNum, dataSource: 'real' }),
          undefined,
          true,
        ),
      {
        wrapper: createWrapper(client),
        initialProps: { nickname: 'alice', userNum: 1 },
      },
    )

    await waitFor(() => {
      expect(result.current.data?.data.userNum).toBe(1)
    })

    rerender({ nickname: 'bob', userNum: 2 })

    expect(result.current.data).toBeUndefined()

    await waitFor(() => {
      expect(result.current.data?.data.userNum).toBe(2)
    })
  })
})
