import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useProfileRefresh } from '@/hooks/useProfileRefresh'
import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

const isRealModeMock = vi.fn(() => true)
const fetchPlayerByNicknameMock = vi.fn()
const fetchMatchDTOHistoryMock = vi.fn()
const fetchPlayerStatsDTOMock = vi.fn()

vi.mock('@/api/erClient', () => ({
  isRealMode: () => isRealModeMock(),
}))

vi.mock('@/api/player', () => ({
  fetchPlayerByNickname: (...args: unknown[]) => fetchPlayerByNicknameMock(...args),
  fetchMatchDTOHistory: (...args: unknown[]) => fetchMatchDTOHistoryMock(...args),
  fetchPlayerStatsDTO: (...args: unknown[]) => fetchPlayerStatsDTOMock(...args),
}))

const MINE_SCOPE = playerQueryOwnerScope({
  nickname: '마인',
  userNum: 1009897353,
  dataSource: 'real',
})
const MINE_PENDING = playerQueryOwnerScope({ nickname: '마인', dataSource: 'real' })

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return { queryClient, Wrapper: ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ) }
}

describe('useProfileRefresh', () => {
  beforeEach(() => {
    isRealModeMock.mockReturnValue(true)
    fetchPlayerByNicknameMock.mockResolvedValue({
      data: {
        userNum: 1009897353,
        nickname: '마인',
        level: 1,
        tier: 'GOLD1',
        lastRefreshedAt: '2026-06-18T12:00:00.000Z',
      },
    })
    fetchMatchDTOHistoryMock.mockResolvedValue({
      data: { items: [], page: 0, pageSize: 10, hasNext: false },
      source: 'external',
      refreshedAt: '2026-06-18T12:00:00.000Z',
      profileRefresh: {
        rankUpdated: true,
        latestGameIdBefore: null,
        latestGameIdAfter: null,
        gamesFetched: 0,
        newGamesInserted: 0,
        matchesUpdated: false,
        statsInvalidated: true,
        aggregateInvalidated: true,
        snapshotInvalidatedOrRebuilt: false,
        refreshCompletedAt: new Date().toISOString(),
        skipReason: 'no-new-games',
      },
    })
    fetchPlayerStatsDTOMock.mockResolvedValue({
      data: { userNum: 1009897353, games: 0, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, top3: 0, mmr: 0 },
      source: 'external',
      refreshedAt: '2026-06-18T12:00:00.000Z',
    })
  })

  it('mock 모드에서는 canRefresh가 false', () => {
    isRealModeMock.mockReturnValue(false)
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useProfileRefresh('마인'), {
      wrapper: Wrapper,
    })
    expect(result.current.canRefresh).toBe(false)
  })

  it('명시적 갱신 시 owner scope 캐시만 갱신', async () => {
    const { queryClient, Wrapper } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.spyOn(queryClient, 'isFetching').mockReturnValue(0)

    const hayingScope = playerQueryOwnerScope({
      nickname: '하잉',
      userNum: 460448438,
      dataSource: 'real',
    })
    queryClient.setQueryData(playerQueryKeys.statsDto(hayingScope, ''), {
      data: { userNum: 460448438, games: 99 },
    })

    const { result } = renderHook(
      () =>
        useProfileRefresh('마인', {
          matchMode: 'rank',
          seasonId: 11,
          ownerScope: MINE_SCOPE,
          statsDtoOptions: { userNum: 1009897353 },
          navigationKey: 'nav-mine',
        }),
      { wrapper: Wrapper },
    )

    await act(async () => {
      await result.current.refresh()
    })

    const hayingAfter = queryClient.getQueryData(playerQueryKeys.statsDto(hayingScope, '')) as {
      data: { games: number }
    }
    expect(hayingAfter?.data.games).toBe(99)
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: playerQueryKeys.seasonsPrefix(MINE_SCOPE),
        refetchType: 'none',
      }),
    )
    const matchesCache = queryClient.getQueryData(
      playerQueryKeys.matchesDto(MINE_SCOPE, 10, 'rank'),
    ) as { pages: unknown[] } | undefined
    expect(matchesCache?.pages).toHaveLength(1)
    expect(queryClient.getQueryData(playerQueryKeys.summary(MINE_PENDING))).toBeTruthy()
  })

  it('route 이동 후 늦게 도착한 refresh 응답은 캐시에 반영하지 않는다', async () => {
    const { queryClient, Wrapper } = createWrapper()
    vi.spyOn(queryClient, 'isFetching').mockReturnValue(0)

    let resolveRefresh!: () => void
    const refreshGate = new Promise<void>((resolve) => {
      resolveRefresh = resolve
    })

    fetchPlayerByNicknameMock.mockImplementation(async () => {
      await refreshGate
      return {
        data: {
          userNum: 1009897353,
          nickname: '마인',
          level: 1,
          tier: 'GOLD1',
        },
      }
    })

    const { result, rerender } = renderHook(
      ({ navigationKey }: { navigationKey: string }) =>
        useProfileRefresh('마인', {
          navigationKey,
          ownerScope: MINE_SCOPE,
          statsDtoOptions: { userNum: 1009897353 },
        }),
      {
        wrapper: Wrapper,
        initialProps: { navigationKey: 'nav-mine' },
      },
    )

    let refreshPromise!: Promise<void>
    act(() => {
      refreshPromise = result.current.refresh()
    })

    rerender({ navigationKey: 'nav-haying' })

    resolveRefresh()
    await act(async () => {
      await refreshPromise
    })

    expect(queryClient.getQueryData(playerQueryKeys.summary(MINE_PENDING))).toBeUndefined()
    expect(queryClient.getQueryData(playerQueryKeys.statsDto(MINE_SCOPE, ''))).toBeUndefined()
  })

  it('갱신 완료 후 aggregate fetch를 기다리지 않고 로딩을 종료한다', async () => {
    const { queryClient, Wrapper } = createWrapper()
    vi.spyOn(queryClient, 'isFetching').mockReturnValue(0)

    const { result } = renderHook(
      () =>
        useProfileRefresh('마인', {
          matchMode: 'rank',
          ownerScope: MINE_SCOPE,
          statsDtoOptions: { userNum: 1009897353 },
          navigationKey: 'nav-mine',
        }),
      { wrapper: Wrapper },
    )

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.freshnessLabel).toBe('방금 갱신')
  })
})
