import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProfilePage } from '@/pages/ProfilePage'
import type { PlayerSummary } from '@/types/player'
import type { PlayerStatsDTO } from '@/types/player'

const usePlayerSummaryMock = vi.fn()
const usePlayerStatsDTOMock = vi.fn()
const usePlayerSeasonsMock = vi.fn()
const useMatchDTOHistoryMock = vi.fn()

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

vi.mock('@/hooks/usePlayerSummary', () => ({
  usePlayerSummary: (...args: unknown[]) => usePlayerSummaryMock(...args),
}))

vi.mock('@/hooks/usePlayerStatsDTO', () => ({
  usePlayerStatsDTO: (...args: unknown[]) => usePlayerStatsDTOMock(...args),
}))

vi.mock('@/hooks/usePlayerSeasons', () => ({
  usePlayerSeasons: (...args: unknown[]) => usePlayerSeasonsMock(...args),
}))

vi.mock('@/hooks/useMatchDTOHistory', () => ({
  useMatchDTOHistory: (...args: unknown[]) => useMatchDTOHistoryMock(...args),
  MATCHES_DTO_PAGE_SIZE: 10,
}))

vi.mock('@/hooks/useProfileRefresh', () => ({
  useProfileRefresh: () => ({
    refresh: vi.fn(),
    isRefreshing: false,
    manualRefreshActive: false,
    lastRefreshedAt: null,
    refreshError: null,
    canRefresh: true,
  }),
}))

function idleQuery<T>(data: T | undefined = undefined) {
  return {
    data,
    dataUpdatedAt: Date.now(),
    isPending: data === undefined,
    isError: false,
    isSuccess: data !== undefined,
    isFetching: false,
    fetchStatus: 'idle' as const,
    status: data === undefined ? ('pending' as const) : ('success' as const),
    error: null,
    refetch: vi.fn(),
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }
}

function summaryFor(nickname: string, userNum: number, hasProfileCache = true): PlayerSummary {
  return {
    userNum,
    nickname,
    level: 100,
    tier: 'DIAMOND2',
    currentSeason: 11,
    hasProfileCache,
  }
}

function statsDtoFor(
  userNum: number,
  characterName: string,
  characterNum = 19,
): { data: PlayerStatsDTO } {
  return {
    data: {
      games: 10,
      winRate: 20,
      avgKills: 2,
      avgPlacement: 4,
      kda: 3,
      kdaString: '3.00',
      mostPlayedCharacter: { name: characterName, count: 10 },
      tier: 'DIAMOND',
      mmr: 5000,
      userNum,
      playerMatchCharacterStats: [
        {
          characterNum,
          characterName,
          games: 20,
          wins: 3,
          winRate: 15,
          avgRank: 4,
          kills: 40,
          assists: 20,
          deaths: 10,
          kda: 3,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 12000,
          gradeLabel: 'A',
          totalRpDelta: 100,
        },
      ],
      playerMatchCharacterStatsMeta: {
        status: 'complete',
        userNum,
        seasonId: 11,
        generatedAt: '2026-06-19T00:00:00.000Z',
        rowCount: 1,
        matchCount: 20,
      },
    },
  }
}

function seasonsRows(from: number, to: number, userNum: number, nickname: string) {
  return {
    currentSeason: 11,
    owner: { nickname, userNum },
    requestedRange: { from, to },
    status: from === to && to === 11 ? ('partial' as const) : ('complete' as const),
    seasons: Array.from({ length: to - from + 1 }, (_, index) => {
      const seasonNumber = from + index
      return {
        seasonNumber,
        played: true,
        tier: 'GOLD4',
        rank: { tier: '골드', division: 4, rp: 3000 },
        wins: 3,
        losses: 7,
        avgPlacement: 5.2,
        kda: 2.5,
        top3Rate: 30,
      }
    }),
  }
}

describe('ProfilePage identity handoff contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMatchDTOHistoryMock.mockReturnValue({
      ...idleQuery({
        pages: [{ data: { items: [], page: 0, pageSize: 10, hasNext: false }, source: 'cache' }],
        pageParams: [0],
      }),
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    })
    usePlayerSeasonsMock.mockImplementation(
      (nickname: string, from: number, to: number, enabled: boolean) => {
        if (!enabled) {
          return idleQuery(undefined)
        }
        return idleQuery(seasonsRows(from, to, nickname === '하잉' ? 2 : 1, nickname))
      },
    )
  })

  function renderAt(path: string, client = new QueryClient()) {
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/player/:nickname" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('stats A→B handoff: B summary ready + A stats placeholder면 B 화면에 A 캐릭터가 표시되지 않는다', async () => {
    usePlayerSummaryMock.mockImplementation((nickname: string) => {
      if (nickname === 'bob') {
        return idleQuery(summaryFor('bob', 2))
      }
      return idleQuery(undefined)
    })
    usePlayerStatsDTOMock.mockImplementation((nickname: string) => {
      if (nickname === 'bob') {
        return {
          ...idleQuery(undefined),
          fetchStatus: 'fetching' as const,
          isFetching: true,
          status: 'pending' as const,
        }
      }
      return idleQuery(statsDtoFor(1, '엠마'))
    })

    renderAt('/player/bob')
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'bob' })).toBeInTheDocument()
    })
    expect(screen.queryByText('엠마')).not.toBeInTheDocument()
  })

  it('B 화면에는 B owner stats만 표시된다', async () => {
    usePlayerSummaryMock.mockImplementation((nickname: string) => {
      if (nickname === '하잉') {
        return idleQuery(summaryFor('하잉', 2))
      }
      return idleQuery(undefined)
    })
    usePlayerStatsDTOMock.mockImplementation((nickname: string) => {
      if (nickname === '하잉') {
        return idleQuery(statsDtoFor(2, '리오', 31))
      }
      return idleQuery(statsDtoFor(1, '엠마'))
    })

    renderAt(`/player/${encodeURIComponent('하잉')}`)
    await waitFor(() => {
      expect(screen.getAllByText('리오').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('엠마')).not.toBeInTheDocument()
  })

  it('seasons query policy: B summary pending이면 past/full 비활성', () => {
    const seasonsCalls: Array<{ nickname: string; from: number; to: number; enabled: boolean }> = []

    usePlayerSummaryMock.mockReturnValue(idleQuery(undefined))
    usePlayerStatsDTOMock.mockReturnValue(idleQuery(undefined))
    usePlayerSeasonsMock.mockImplementation(
      (nickname: string, from: number, to: number, enabled: boolean) => {
        seasonsCalls.push({ nickname, from, to, enabled })
        if (!enabled) return idleQuery(undefined)
        return idleQuery(seasonsRows(from, to, 2, nickname))
      },
    )

    renderAt('/player/bob')
    expect(
      seasonsCalls.some((call) => call.nickname === 'bob' && call.from === 1 && call.enabled),
    ).toBe(false)
  })
})
