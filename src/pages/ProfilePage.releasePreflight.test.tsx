import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { RANK_AGGREGATE_STATS_LABEL } from '@/analysis/realProfileReport'
import { ProfilePage } from '@/pages/ProfilePage'
import type { PlayerSummary } from '@/types/player'

const usePlayerSummaryMock = vi.fn()
const usePlayerStatsDTOMock = vi.fn()
const usePlayerSeasonsMock = vi.fn()
const useMatchDTOHistoryMock = vi.fn()
const getPlayerSeasonAggregateMock = vi.fn()

vi.mock('@/hooks/usePlayerSummary', () => ({
  usePlayerSummary: (...args: unknown[]) => usePlayerSummaryMock(...args),
}))

vi.mock('@/hooks/usePlayerStatsDTO', () => ({
  usePlayerStatsDTO: (...args: unknown[]) => usePlayerStatsDTOMock(...args),
}))

vi.mock('@/hooks/usePlayerSeasons', () => ({
  usePlayerSeasons: (...args: unknown[]) => usePlayerSeasonsMock(...args),
}))

vi.mock('@/hooks/useMatchDTOHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useMatchDTOHistory')>()
  return {
    ...actual,
    useMatchDTOHistory: (...args: unknown[]) => useMatchDTOHistoryMock(...args),
  }
})

vi.mock('@/hooks/useRecentMatchFreshness', () => ({
  useRecentMatchFreshness: vi.fn(),
}))

vi.mock('@/api/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/player')>()
  return {
    ...actual,
    getPlayerSeasonAggregate: (...args: unknown[]) => getPlayerSeasonAggregateMock(...args),
  }
})

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

function idleQuery<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: 'idle' as const,
    error: null,
  }
}

function emptyMatchesQuery() {
  return {
    data: {
      pages: [{ data: { items: [], hasNext: false, page: 0, pageSize: 10 }, source: 'cache' }],
    },
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: 'idle' as const,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }
}

function summaryFor(nickname: string, userNum: number): PlayerSummary {
  return {
    userNum,
    nickname,
    level: 100,
    tier: 'DIAMOND2',
    currentSeason: 11,
    hasProfileCache: true,
  }
}

function playerMatchStatsFor(
  names: { code: number; name: string; games: number }[],
  userNum: number,
) {
  return {
    data: {
      games: names.reduce((sum, row) => sum + row.games, 0),
      winRate: 30,
      avgKills: 2,
      avgPlacement: 4,
      kda: 3,
      kdaString: '3.00',
      mostPlayedCharacter: { name: names[0]?.name ?? '-', count: names[0]?.games ?? 0 },
      tier: '다이아몬드',
      mmr: 2400,
      userNum,
      characterStats: names.slice(0, 3).map((row) => ({
        characterCode: row.code,
        totalGames: row.games,
        wins: 1,
        top3: 2,
        averageRank: 4,
      })),
      playerMatchCharacterStats: names.map((row) => ({
        characterNum: row.code,
        characterName: row.name,
        games: row.games,
        wins: 1,
        winRate: 10,
        avgRank: 4,
        kills: 20,
        assists: 30,
        deaths: 10,
        kda: 5,
        avgTeamKills: 8,
        avgKills: 2,
        avgDamage: 12000,
        gradeLabel: 'A',
      })),
    },
    source: 'cache' as const,
    refreshedAt: new Date().toISOString(),
  }
}

function renderWithSwitcher(initialNickname: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/player/${encodeURIComponent(initialNickname)}`]}>
        <Link to={`/player/${encodeURIComponent('연서')}`}>연서로 이동</Link>
        <Link to={`/player/${encodeURIComponent('절단마술사')}`}>절단마술사로 이동</Link>
        <Routes>
          <Route path="/player/:nickname" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('39.10I release preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePlayerSeasonsMock.mockReturnValue(
      idleQuery({
        currentSeason: 11,
        seasons: [
          {
            seasonNumber: 11,
            played: true,
            tier: 'GOLD4',
            rank: { tier: '골드', division: 4, rp: 6000 },
            wins: 3,
            losses: 7,
            avgPlacement: 5.2,
            kda: 2.5,
            top3Rate: 30,
          },
        ],
      }),
    )
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery())
    getPlayerSeasonAggregateMock.mockResolvedValue({ data: null })
  })

  it('유저 A→B→A 전환 시 이전 유저 캐릭터 통계가 잔류하지 않음', async () => {
    const user = userEvent.setup()
    usePlayerSummaryMock.mockImplementation((nickname: string) => {
      if (nickname === '연서') return idleQuery(summaryFor('연서', 22222))
      return idleQuery(summaryFor('절단마술사', 11111))
    })
    usePlayerStatsDTOMock.mockImplementation((nickname: string) => {
      if (nickname === '연서') {
        return idleQuery(
          playerMatchStatsFor(
            [
            { code: 31, name: '리오', games: 40 },
            { code: 21, name: '로지', games: 35 },
            { code: 69, name: '레니', games: 30 },
            { code: 11, name: '유키', games: 25 },
          ],
            22222,
          ),
        )
      }
      return idleQuery(
        playerMatchStatsFor([{ code: 19, name: '엠마', games: 335 }], 11111),
      )
    })

    renderWithSwitcher('절단마술사')

    expect(await screen.findByText('엠마')).toBeInTheDocument()
    expect(screen.getByText(RANK_AGGREGATE_STATS_LABEL)).toBeInTheDocument()
    expect(screen.queryByText('리오')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '연서로 이동' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: '연서' })).toBeInTheDocument(),
    )
    expect(await screen.findByText('리오')).toBeInTheDocument()
    expect(screen.getByText('로지')).toBeInTheDocument()
    expect(screen.queryByText('엠마')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '절단마술사로 이동' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: '절단마술사' })).toBeInTheDocument(),
    )
    expect(await screen.findByText('엠마')).toBeInTheDocument()
    expect(screen.queryByText('리오')).not.toBeInTheDocument()
    expect(screen.queryByText('로지')).not.toBeInTheDocument()
    expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('절단마술사', 11)
    expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('연서', 11)
  })
})
