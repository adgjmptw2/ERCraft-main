import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProfilePage } from '@/pages/ProfilePage'
import type { PlayerSummary } from '@/types/player'
import { MATCH_HISTORY_MODE_EMPTY_MESSAGE } from '@/types/matchMode'

const summaryFixture: PlayerSummary = {
  userNum: 12345,
  nickname: 'fencing',
  level: 100,
  tier: 'DIAMOND2',
  currentSeason: 11,
}

const usePlayerSummaryMock = vi.fn()
const usePlayerStatsDTOMock = vi.fn()
const usePlayerSeasonsMock = vi.fn()
const useMatchDTOHistoryMock = vi.fn()
const getPlayerSeasonAggregateMock = vi.fn()
const fetchPlayerSeasonsMock = vi.fn()

vi.mock('@/api/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/player')>()
  return {
    ...actual,
    getPlayerSeasonAggregate: (...args: unknown[]) => getPlayerSeasonAggregateMock(...args),
    fetchPlayerSeasons: (...args: unknown[]) => fetchPlayerSeasonsMock(...args),
  }
})

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

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

function idleQuery<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    fetchStatus: 'idle' as const,
    error: null,
    refetch: vi.fn(),
  }
}

function matchesQueryResult(items: unknown[] = []) {
  return {
    ...idleQuery({
      pages: [{ data: { items, page: 0, pageSize: 10, hasNext: false }, source: 'cache' }],
      pageParams: [0],
    }),
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }
}

function ProfileWithNavigate() {
  const navigate = useNavigate()
  return (
    <>
      <ProfilePage />
      <button type="button" onClick={() => navigate('/player/연서')}>
        go 연서
      </button>
    </>
  )
}

function renderProfile(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/player/:nickname" element={<ProfileWithNavigate />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const seasonRecordFixture = {
  seasonNumber: 11,
  played: true,
  tier: 'GOLD4',
  rank: { tier: '골드', division: 4, rp: 6000 },
  wins: 3,
  losses: 7,
  avgPlacement: 5.2,
  kda: 2.5,
  top3Rate: 30,
}

describe('ProfilePage match mode hotfix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerStatsDTOMock.mockReturnValue(
      idleQuery({
        data: {
          games: 10,
          winRate: 30,
          avgKills: 2,
          avgPlacement: 5,
          kda: 3,
          kdaString: '3.00',
          mostPlayedCharacter: { name: '재키', count: 4 },
          tier: '다이아몬드',
          mmr: 2400,
          userNum: 12345,
          characterStats: [],
        },
        source: 'cache',
      }),
    )
    fetchPlayerSeasonsMock.mockResolvedValue({
      data: { currentSeason: 11, seasons: [] },
      source: 'cache',
    })
    usePlayerSeasonsMock.mockReturnValue(
      idleQuery({ currentSeason: 11, seasons: [seasonRecordFixture] }),
    )
    getPlayerSeasonAggregateMock.mockResolvedValue({
      data: {
        userNum: 12345,
        seasonId: 11,
        cacheStatus: 'ready',
        isRefreshing: false,
        characterStats: [{ characterNum: 10, characterName: '재키', games: 5, wins: 2, winRate: 40, kda: 2 }],
        rpSeries: [{ playedAt: '2026-06-01T00:00:00.000Z', rpAfter: 6000 }],
        backfillProgress: { status: 'complete', officialSeasonGames: 10, collectedGames: 10 },
      },
      source: 'cache',
    })
    useMatchDTOHistoryMock.mockImplementation((_nick: string, enabled: boolean, mode = 'all') => {
      if (!enabled) return matchesQueryResult([])
      const rows = [{ matchId: 'm-all', gameMode: 'rank' }]
      return matchesQueryResult(mode === 'all' || mode === 'rank' ? rows : [])
    })
  })

  it('초기 진입 시 all + selected mode query', () => {
    renderProfile('/player/fencing')
    expect(useMatchDTOHistoryMock).toHaveBeenCalledWith('fencing', expect.any(Boolean), 'all')
    expect(useMatchDTOHistoryMock.mock.calls.every((call) => call.length === 3)).toBe(true)
  })

  it('rank 선택 후 다른 유저로 이동하면 all로 reset', async () => {
    usePlayerSummaryMock.mockImplementation((nick: string) =>
      idleQuery(
        nick === '연서'
          ? { ...summaryFixture, nickname: '연서', userNum: 99999 }
          : summaryFixture,
      ),
    )
    usePlayerStatsDTOMock.mockImplementation((nick: string) =>
      idleQuery({
        data: {
          games: 10,
          winRate: 30,
          avgKills: 2,
          avgPlacement: 5,
          kda: 3,
          kdaString: '3.00',
          mostPlayedCharacter: { name: '재키', count: 4 },
          tier: '다이아몬드',
          mmr: 2400,
          userNum: nick === '연서' ? 99999 : 12345,
          characterStats: [],
        },
        source: 'cache',
      }),
    )
    const user = userEvent.setup()
    renderProfile('/player/fencing')

    await user.click(screen.getByRole('tab', { name: '랭크' }))
    await user.click(screen.getByRole('button', { name: 'go 연서' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '연서' })).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: '전체', selected: true })).toBeInTheDocument()
  })

  it('real 모드에서는 season aggregate 없이 mode 변경해도 추가 요청 없음', async () => {
    const user = userEvent.setup()
    renderProfile('/player/fencing')

    await waitFor(() => expect(screen.getByRole('heading', { name: 'fencing' })).toBeInTheDocument())
    await waitFor(() =>
      expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('fencing', 11),
    )
    const aggregateCallsBeforeModeChanges = getPlayerSeasonAggregateMock.mock.calls.length

    await user.click(screen.getByRole('tab', { name: '랭크' }))
    await user.click(screen.getByRole('tab', { name: '코발트' }))
    await user.click(screen.getByRole('tab', { name: '전체' }))

    expect(getPlayerSeasonAggregateMock).toHaveBeenCalledTimes(aggregateCallsBeforeModeChanges)
    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'rank')).toBe(true)
    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'cobalt')).toBe(true)
  })

  it('mode 변경 시 분석 source/sample이 유지됨', async () => {
    getPlayerSeasonAggregateMock.mockResolvedValue({ data: null })
    usePlayerStatsDTOMock.mockReturnValue(
      idleQuery({
        data: {
          games: 808,
          winRate: 30,
          avgKills: 2,
          avgPlacement: 5,
          kda: 3,
          kdaString: '3.00',
          mostPlayedCharacter: { name: '재키', count: 400 },
          tier: '다이아몬드',
          mmr: 2400,
          userNum: 12345,
          characterStats: [
            { characterCode: 10, totalGames: 808, wins: 200, top3: 400, averageRank: 4 },
          ],
        },
        source: 'cache',
      }),
    )

    const user = userEvent.setup()
    renderProfile('/player/fencing')

    await waitFor(() => expect(screen.getByRole('heading', { name: 'fencing' })).toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: '분석' }))

    const analysisPanel = await screen.findByRole('tabpanel', { name: '분석' })
    expect(within(analysisPanel).getByText(/시즌 데이터/)).toBeInTheDocument()
    expect(within(analysisPanel).getByText(/표본 808전 · 신뢰도 높음/)).toBeInTheDocument()
    expect(within(analysisPanel).getAllByText(/플레이 경향/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: '전적' }))
    await user.click(screen.getByRole('tab', { name: '랭크' }))
    await user.click(screen.getByRole('tab', { name: '코발트' }))
    await user.click(screen.getByRole('tab', { name: '분석' }))

    const analysisPanelAfterMode = await screen.findByRole('tabpanel', { name: '분석' })
    expect(within(analysisPanelAfterMode).getByText(/표본 808전 · 신뢰도 높음/)).toBeInTheDocument()
    const trendLabelsAfterMode = within(analysisPanelAfterMode).getAllByText(/플레이 경향/)
    expect(trendLabelsAfterMode.length).toBeGreaterThan(0)
    expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('fencing', 11)
  })

  it('union 탭 empty state에 DB empty 안내', async () => {
    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await user.click(screen.getByRole('tab', { name: '유니온' }))

    expect(await screen.findByText(MATCH_HISTORY_MODE_EMPTY_MESSAGE)).toBeInTheDocument()
  })
})
