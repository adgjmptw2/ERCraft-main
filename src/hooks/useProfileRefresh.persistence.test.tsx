import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useProfileRefresh } from '@/hooks/useProfileRefresh'
import { formatRefreshTimeLabel } from '@/utils/refreshTimeLabel'

const fetchPlayerByNicknameMock = vi.fn()
const fetchMatchDTOHistoryMock = vi.fn()
const fetchPlayerStatsDTOMock = vi.fn()

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

vi.mock('@/api/player', () => ({
  fetchPlayerByNickname: (...args: unknown[]) => fetchPlayerByNicknameMock(...args),
  fetchMatchDTOHistory: (...args: unknown[]) => fetchMatchDTOHistoryMock(...args),
  fetchPlayerStatsDTO: (...args: unknown[]) => fetchPlayerStatsDTOMock(...args),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  vi.spyOn(queryClient, 'isFetching').mockReturnValue(0)
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useProfileRefresh persistence (39.10F)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'))
    fetchPlayerByNicknameMock.mockResolvedValue({
      data: {
        userNum: 1,
        nickname: '마인',
        level: 1,
        tier: 'GOLD1',
        lastRefreshedAt: '2026-06-01T08:00:00.000Z',
      },
    })
    fetchMatchDTOHistoryMock.mockResolvedValue({
      data: { items: [], page: 0, pageSize: 10, hasNext: false },
      source: 'external',
      refreshedAt: '2026-06-18T12:00:00.000Z',
    })
    fetchPlayerStatsDTOMock.mockResolvedValue({
      data: { userNum: 1, games: 0, winRate: 0, avgKills: 0, avgPlacement: 0, kda: 0, kdaString: '0', tier: 'GOLD', mmr: 0 },
      source: 'external',
      refreshedAt: '2026-06-18T12:00:00.000Z',
    })
  })

  it('수동 갱신 직후 UI는 방금 갱신', async () => {
    const { result } = renderHook(
      () =>
        useProfileRefresh('마인', {
          initialLastRefreshedAt: '2026-06-01T08:00:00.000Z',
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.lastRefreshedAt).not.toBeNull()
    expect(formatRefreshTimeLabel(result.current.lastRefreshedAt!, new Date())).toBe('방금 갱신')
  })

  it('reload 시뮬레이션 — persisted backend timestamp 유지', async () => {
    const persistedBackend = '2026-06-18T12:00:00.000Z'
    const refreshAt = new Date('2026-06-18T12:00:00.000Z')

    const { result } = renderHook(
      ({ initial }: { initial: string | null }) =>
        useProfileRefresh('마인', { initialLastRefreshedAt: initial }),
      {
        wrapper: createWrapper(),
        initialProps: { initial: '2026-06-01T08:00:00.000Z' },
      },
    )

    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.lastRefreshedAt?.toISOString()).toBe(refreshAt.toISOString())

    const reloaded = renderHook(
      () => useProfileRefresh('마인', { initialLastRefreshedAt: persistedBackend }),
      { wrapper: createWrapper() },
    )
    expect(reloaded.result.current.lastRefreshedAt?.toISOString()).toBe(
      new Date(persistedBackend).toISOString(),
    )
    expect(formatRefreshTimeLabel(reloaded.result.current.lastRefreshedAt!, refreshAt)).toBe(
      '방금 갱신',
    )
    vi.useRealTimers()
  })
})
