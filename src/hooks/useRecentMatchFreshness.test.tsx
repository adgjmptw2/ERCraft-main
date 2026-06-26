import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useRecentMatchFreshness } from '@/hooks/useRecentMatchFreshness'
import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

const isRealModeMock = vi.fn(() => true)
const fetchPlayerByNicknameMock = vi.fn()

vi.mock('@/api/erClient', () => ({
  isRealMode: () => isRealModeMock(),
}))

vi.mock('@/api/player', () => ({
  fetchPlayerByNickname: (...args: unknown[]) => fetchPlayerByNicknameMock(...args),
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useRecentMatchFreshness', () => {
  beforeEach(() => {
    isRealModeMock.mockReturnValue(true)
    fetchPlayerByNicknameMock.mockReset()
  })

  it('checking이 아니면 polling하지 않음', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      () =>
        useRecentMatchFreshness({
          enabled: true,
          nickname: '마인',
          navigationKey: 'nav-1',
          summary: {
            hasProfileCache: true,
            lastRefreshedAt: '2026-06-19T10:00:00.000Z',
            lastCheckedAt: '2026-06-19T10:00:00.000Z',
            recentMatchCheckStatus: 'skipped-fresh',
          },
          manualRefreshActive: false,
        }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.phase).toBe('idle')
    })
    expect(fetchPlayerByNicknameMock).not.toHaveBeenCalled()
  })

  it('checking 중 lastCheckedAt 갱신 시 no-change로 종료', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    fetchPlayerByNicknameMock.mockResolvedValue({
      data: {
        nickname: '마인',
        lastRefreshedAt: '2026-06-19T10:00:00.000Z',
        lastCheckedAt: '2026-06-19T12:00:00.000Z',
        recentMatchCheckStatus: 'skipped-fresh',
        hasProfileCache: true,
      },
    })

    const { result } = renderHook(
      () =>
        useRecentMatchFreshness({
          enabled: true,
          nickname: '마인',
          navigationKey: 'nav-1',
          summary: {
            hasProfileCache: true,
            lastRefreshedAt: '2026-06-19T10:00:00.000Z',
            lastCheckedAt: null,
            recentMatchCheckStatus: 'scheduled',
          },
          manualRefreshActive: false,
        }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.phase).toBe('no-change')
    })
    expect(fetchPlayerByNicknameMock).toHaveBeenCalledTimes(1)
  })

  it('lastRefreshedAt 변경 시 한 번만 invalidate', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    fetchPlayerByNicknameMock.mockResolvedValue({
      data: {
        nickname: '마인',
        lastRefreshedAt: '2026-06-19T12:00:00.000Z',
        lastCheckedAt: '2026-06-19T12:00:00.000Z',
        recentMatchCheckStatus: 'skipped-fresh',
        hasProfileCache: true,
      },
    })

    const { result } = renderHook(
      () =>
        useRecentMatchFreshness({
          enabled: true,
          nickname: '마인',
          navigationKey: 'nav-1',
          summary: {
            hasProfileCache: true,
            lastRefreshedAt: '2026-06-19T10:00:00.000Z',
            lastCheckedAt: null,
            recentMatchCheckStatus: 'scheduled',
          },
          manualRefreshActive: false,
        }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.phase).toBe('updated')
    })

    const matchesInvalidations = invalidateSpy.mock.calls.filter(([args]) =>
      JSON.stringify(args?.queryKey).includes('matches-dto'),
    )
    expect(matchesInvalidations).toHaveLength(1)
    expect(fetchPlayerByNicknameMock).toHaveBeenCalledTimes(1)
  })

  it('cooldown 상태면 failed로 종료', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    fetchPlayerByNicknameMock.mockResolvedValue({
      data: {
        nickname: '마인',
        lastRefreshedAt: '2026-06-19T10:00:00.000Z',
        lastCheckedAt: '2026-06-19T10:00:00.000Z',
        recentMatchCheckStatus: 'skipped-cooldown',
        hasProfileCache: true,
      },
    })

    const { result } = renderHook(
      () =>
        useRecentMatchFreshness({
          enabled: true,
          nickname: '마인',
          navigationKey: 'nav-1',
          summary: {
            hasProfileCache: true,
            lastRefreshedAt: '2026-06-19T10:00:00.000Z',
            lastCheckedAt: '2026-06-19T10:00:00.000Z',
            recentMatchCheckStatus: 'scheduled',
          },
          manualRefreshActive: false,
        }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.phase).toBe('failed')
    })
    expect(fetchPlayerByNicknameMock).toHaveBeenCalledTimes(1)
  })

  it('nickname 변경 시 이전 polling 취소', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let resolveFirst: ((value: unknown) => void) | undefined
    fetchPlayerByNicknameMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )

    const { rerender } = renderHook(
      ({ nickname }) =>
        useRecentMatchFreshness({
          enabled: true,
          nickname,
          navigationKey: `nav-${nickname}`,
          summary: {
            hasProfileCache: true,
            lastRefreshedAt: null,
            lastCheckedAt: null,
            recentMatchCheckStatus: 'scheduled',
          },
          manualRefreshActive: false,
        }),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { nickname: '마인' },
      },
    )

    await waitFor(() => {
      expect(fetchPlayerByNicknameMock).toHaveBeenCalledTimes(1)
    })

    rerender({ nickname: '연서' })

    await act(async () => {
      resolveFirst?.({
        data: {
          nickname: '마인',
          lastRefreshedAt: '2026-06-19T12:00:00.000Z',
          lastCheckedAt: '2026-06-19T12:00:00.000Z',
          recentMatchCheckStatus: 'skipped-fresh',
          hasProfileCache: true,
        },
      })
      await Promise.resolve()
    })

    expect(
      queryClient.getQueryData(
        playerQueryKeys.summary(playerQueryOwnerScope({ nickname: '마인', dataSource: 'real' })),
      ),
    ).toBeUndefined()
  })
})
