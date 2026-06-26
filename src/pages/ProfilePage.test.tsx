import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProfilePage } from '@/pages/ProfilePage'
import { PROFILE_NOT_FOUND_DESCRIPTION, PROFILE_STATS_SECTION_ERROR } from '@/utils/playerError'
import type { MatchSummaryDTO } from '@/types/match'
import type { PlayerSummary } from '@/types/player'

const summaryFixture: PlayerSummary = {
  userNum: 12345,
  nickname: '절단마술사',
  level: 100,
  tier: 'DIAMOND2',
  currentSeason: 11,
}

const usePlayerSummaryMock = vi.fn()
const usePlayerStatsDTOMock = vi.fn()
const usePlayerSeasonsMock = vi.fn()
const useMatchDTOHistoryMock = vi.fn()
const useLoadAdditionalMatchPagesMock = vi.fn()
const fetchPlayerSeasonsMock = vi.fn()
const getPlayerSeasonAggregateMock = vi.fn()
const fetchNextPageMock = vi.fn()

vi.mock('@/api/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/player')>()
  return {
    ...actual,
    fetchPlayerSeasons: (...args: unknown[]) => fetchPlayerSeasonsMock(...args),
    getPlayerSeasonAggregate: (...args: unknown[]) => getPlayerSeasonAggregateMock(...args),
  }
})

vi.mock('@/hooks/useLoadAdditionalMatchPages', () => ({
  useLoadAdditionalMatchPages: (...args: unknown[]) => useLoadAdditionalMatchPagesMock(...args),
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

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

function idleQuery<T>(data: T) {
  return {
    data,
    dataUpdatedAt: Date.now(),
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    fetchStatus: 'idle' as const,
    status: 'success' as const,
    error: null,
    refetch: vi.fn(),
  }
}

function pendingQuery() {
  return {
    data: undefined,
    isPending: true,
    isError: false,
    isSuccess: false,
    fetchStatus: 'fetching' as const,
    error: null,
  }
}

function errorQuery(error: Error) {
  return {
    data: undefined,
    isPending: false,
    isError: true,
    isSuccess: false,
    fetchStatus: 'idle' as const,
    error,
  }
}

function emptyMatchesQuery(hasNext = true) {
  return {
    data: {
      pages: [
        {
          source: 'external' as const,
          data: { items: [], hasNext, page: 0, pageSize: 10 },
        },
      ],
    },
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: 'idle' as const,
    error: null,
    hasNextPage: hasNext,
    isFetchingNextPage: false,
    fetchNextPage: fetchNextPageMock,
  }
}

function pendingMatchesQuery() {
  return {
    data: undefined,
    isPending: true,
    isFetching: true,
    isError: false,
    isSuccess: false,
    fetchStatus: 'fetching' as const,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: fetchNextPageMock,
  }
}

function matchDto(overrides: Partial<MatchSummaryDTO> & Pick<MatchSummaryDTO, 'matchId'>): MatchSummaryDTO {
  const { matchId, ...rest } = overrides
  return {
    matchId,
    userNum: 12345,
    characterNum: 1,
    characterName: '재키',
    placement: 2,
    kills: 3,
    deaths: 1,
    assists: 2,
    gameStartedAt: '2026-06-10T10:00:00+09:00',
    victory: false,
    seasonNumber: 39,
    rpAfter: 8000,
    rpDelta: 20,
    gameDuration: 1200,
    gameDurationLabel: '20:00',
    gameMode: 'rank',
    gameModeLabel: '랭크',
    kdaString: '5.00',
    placementLabel: '2nd',
    relativeTime: '1일 전',
    teamKill: 5,
    playerDamage: 12000,
    rpDeltaValue: 20,
    matchGrade: null,
    teamLuck: null,
    teamLuckLabel: '-',
    teamLuckIcon: '',
    routeLabel: '루트 -',
    characterLevel: 17,
    ...rest,
  }
}

function matchesQueryWithPages(pages: MatchSummaryDTO[][], hasNextPage = false) {
  return {
    data: {
      pages: pages.map((items, page) => ({
        source: 'external' as const,
        data: {
          items,
          hasNext: page < pages.length - 1 || (page === pages.length - 1 && hasNextPage),
          page,
          pageSize: 10,
        },
      })),
    },
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: 'idle' as const,
    error: null,
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage: fetchNextPageMock,
  }
}

function statsWithJack(userNum = 12345) {
  return idleQuery({
    data: {
      games: 12,
      winRate: 40,
      avgKills: 2,
      avgPlacement: 4,
      kda: 3.5,
      kdaString: '3.50',
      mostPlayedCharacter: { name: '재키', count: 5 },
      tier: '다이아몬드',
      mmr: 2400,
      userNum,
      characterStats: [
        {
          characterCode: 1,
          totalGames: 12,
          wins: 4,
          top3: 8,
          averageRank: 4,
        },
      ],
    },
    source: 'external',
    refreshedAt: new Date().toISOString(),
  })
}

function renderProfile(encodedNickname: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/player/${encodedNickname}`]}>
        <Routes>
          <Route path="/player/:nickname" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderProfileWithSwitcher(encodedNickname: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/player/${encodedNickname}`]}>
        <Link to={`/player/${encodeURIComponent('아드마이할게요')}`}>아드마이할게요로 이동</Link>
        <Routes>
          <Route path="/player/:nickname" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfilePage (real mode)', () => {
  const loadMoreMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchPlayerSeasonsMock.mockResolvedValue({
      data: { currentSeason: 11, seasons: [] },
      source: 'external',
      refreshedAt: new Date().toISOString(),
    })
    getPlayerSeasonAggregateMock.mockResolvedValue({
      data: {
        userNum: 12345,
        seasonId: 11,
        apiSeasonId: 11,
        cacheStatus: 'partial',
        source: 'cache',
        basisLabel: '시즌 집계 중',
        isRefreshing: true,
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      },
      source: 'cache',
      refreshedAt: new Date().toISOString(),
    })
    usePlayerStatsDTOMock.mockReturnValue(errorQuery(new Error('stats fail')))
    usePlayerSeasonsMock.mockReturnValue(errorQuery(new Error('seasons fail')))
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery(false))
    useLoadAdditionalMatchPagesMock.mockReturnValue({
      loadMore: loadMoreMock,
      canLoadMore: true,
      isBusy: false,
      error: null,
      clearError: vi.fn(),
    })
  })

  it('최초 진입 — summary 대기 중 seasons·stats 즉시, matches 지연', () => {
    usePlayerSummaryMock.mockReturnValue(pendingQuery())
    renderProfile(encodeURIComponent('절단마술사'))
    expect(
      screen.getByText(/처음 조회하는 유저는 공식 API 응답 때문에 조금 더 걸릴 수 있습니다/),
    ).toBeInTheDocument()
    expect(usePlayerSeasonsMock).toHaveBeenCalledWith('절단마술사', 11, 11, true)
    expect(useMatchDTOHistoryMock).toHaveBeenCalledWith('절단마술사', false, 'all')
    expect(usePlayerStatsDTOMock).toHaveBeenCalledWith(
      '절단마술사',
      {
        tier: undefined,
        normalizedTier: undefined,
        leaderboardRank: undefined,
      },
      true,
    )
  })

  it('summary 완료 후 matches 요청 활성', () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    renderProfile(encodeURIComponent('절단마술사'))
    expect(useMatchDTOHistoryMock).toHaveBeenCalledWith('절단마술사', true, 'all')
  })

  it('summary 성공 후 RP 그래프 없이 기본 프로필 표시', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    useMatchDTOHistoryMock.mockReturnValue(pendingMatchesQuery())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(screen.getByRole('heading', { level: 1, name: '절단마술사' })).toBeInTheDocument()
    expect(screen.getByText('최근 매치')).toBeInTheDocument()
    expect(screen.queryByText('RP 흐름 집계 중')).not.toBeInTheDocument()
    expect(screen.queryByText('RP 흐름 데이터 없음')).not.toBeInTheDocument()
  })

  it('matches·analysis 첫 페이지 성공 후 각각 최대 3페이지까지 자동 prefetch 시작', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery(true))

    renderProfile(encodeURIComponent('절단마술사'))

    await waitFor(() => expect(fetchNextPageMock).toHaveBeenCalledTimes(2))
  })

  it('stats 로딩 중이면 캐릭터 통계 스켈레톤 표시', () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(pendingQuery())
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery(false))

    renderProfile(encodeURIComponent('절단마술사'))

    expect(screen.getByLabelText('캐릭터 통계 로딩')).toBeInTheDocument()
  })

  it('real 모드에서는 현재 시즌 aggregate를 자동 요청함', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())
    useMatchDTOHistoryMock.mockReturnValue(pendingMatchesQuery())

    renderProfile(encodeURIComponent('절단마술사'))

    await waitFor(() => expect(usePlayerStatsDTOMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('절단마술사', 11),
    )
  })

  it('최근 매치 더 보기 클릭 시 fetchNextPage 호출', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    useMatchDTOHistoryMock.mockReturnValue(
      matchesQueryWithPages([[matchDto({ matchId: 'recent-a' })]], true),
    )
    renderProfile(encodeURIComponent('절단마술사'))
    expect(screen.queryByRole('button', { name: '추가 경기 불러오기' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }))
    expect(fetchNextPageMock).toHaveBeenCalled()
    expect(loadMoreMock).not.toHaveBeenCalled()
  })

  it('official stats가 있으면 공식 시즌 통계 기준으로 표시', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('시즌 집계 기준')).toBeInTheDocument()
    await waitFor(() =>
      expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('절단마술사', 11),
    )
  })

  it('official stats가 있으면 aggregate 없이 수집된 시즌 경기 기준 라벨 없이 표시', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery(false))

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()
    expect(screen.getByText('시즌 집계 기준')).toBeInTheDocument()
    expect(screen.queryByText('수집된 시즌 경기 기준')).not.toBeInTheDocument()
  })

  it('다른 플레이어로 이동하면 이전 플레이어 시즌 집계를 표시하지 않음', async () => {
    const adSummary: PlayerSummary = {
      userNum: 67890,
      nickname: '아드마이할게요',
      level: 90,
      tier: 'Mithril',
      currentSeason: 11,
    }
    usePlayerSummaryMock.mockImplementation((requestedNickname: string) =>
      idleQuery(requestedNickname === '아드마이할게요' ? adSummary : summaryFixture),
    )
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockImplementation((requestedNickname: string) =>
      requestedNickname === '절단마술사' ? statsWithJack() : pendingQuery(),
    )
    getPlayerSeasonAggregateMock.mockImplementation((requestedNickname: string) => {
      if (requestedNickname === '아드마이할게요') {
        return new Promise(() => undefined)
      }
      return Promise.resolve({ data: null })
    })

    renderProfileWithSwitcher(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: '아드마이할게요로 이동' }))

    expect(await screen.findByRole('heading', { level: 1, name: '아드마이할게요' }))
      .toBeInTheDocument()
    expect(screen.queryByText('재키')).not.toBeInTheDocument()
    expect(screen.getByLabelText('캐릭터 통계 로딩')).toBeInTheDocument()
  })

  it('official stats 다중 캐릭터는 aggregate 없이도 유지', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(
      idleQuery({
        data: {
          games: 280,
          winRate: 32,
          avgKills: 4,
          avgPlacement: 4.2,
          kda: 3.5,
          kdaString: '3.50',
          mostPlayedCharacter: { name: '엠마', count: 120 },
          tier: '미스릴',
          mmr: 8800,
          userNum: 12345,
          characterStats: [
            { characterCode: 19, totalGames: 120, wins: 40, top3: 80, averageRank: 4.1 },
            { characterCode: 17, totalGames: 80, wins: 20, top3: 50, averageRank: 4.5 },
            { characterCode: 11, totalGames: 40, wins: 10, top3: 20, averageRank: 5.1 },
          ],
        },
        source: 'external',
        refreshedAt: new Date().toISOString(),
      }),
    )
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery(false))

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('엠마')).toBeInTheDocument()
    expect(screen.getByText('아드리아나')).toBeInTheDocument()
    expect(screen.getByText('유키')).toBeInTheDocument()
    expect(screen.getByText('시즌 집계 기준')).toBeInTheDocument()
  })

  it('real 모드에서는 season aggregate 상태를 조회함', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())

    renderProfile(encodeURIComponent('절단마술사'))

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '절단마술사' })).toBeInTheDocument())
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    expect(getPlayerSeasonAggregateMock).toHaveBeenCalled()
  })

  it('다른 플레이어로 이동하면 이전 캐릭터 통계를 표시하지 않음', async () => {
    usePlayerSummaryMock.mockImplementation((nickname: string) => {
      if (nickname === '아드마이할게요') {
        return idleQuery({
          ...summaryFixture,
          userNum: 99999,
          nickname: '아드마이할게요',
        })
      }
      return idleQuery(summaryFixture)
    })
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockImplementation((requestedNickname: string) =>
      requestedNickname === '절단마술사' ? statsWithJack() : pendingQuery(),
    )

    renderProfileWithSwitcher(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: '아드마이할게요로 이동' }))

    expect(await screen.findByRole('heading', { level: 1, name: '아드마이할게요' }))
      .toBeInTheDocument()
    expect(screen.queryByText('재키')).not.toBeInTheDocument()
  })

  it('real 모드에서는 집계 다시 확인 버튼을 표시하지 않음', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '집계 다시 확인' })).not.toBeInTheDocument()
  })

  it('official stats가 있으면 aggregate 없이 캐릭터 표를 표시', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()
    expect(screen.queryByLabelText('캐릭터 통계 로딩')).not.toBeInTheDocument()
  })

  it('stats가 비어 있고 aggregate 없으면 캐릭터 통계 스켈레톤 표시', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(pendingQuery())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByLabelText('캐릭터 통계 로딩')).toBeInTheDocument()
  })

  it('official stats가 있으면 warming aggregate 없이도 최종 통계처럼 표시', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()
    expect(screen.queryByLabelText('캐릭터 통계 로딩')).not.toBeInTheDocument()
    expect(screen.getByText('시즌 집계 기준')).toBeInTheDocument()
  })

  it('aggregate 없이 stats.characterStats를 즉시 표시', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(
      idleQuery({
        data: {
          games: 12,
          winRate: 40,
          avgKills: 2,
          avgPlacement: 4,
          kda: 3,
          kdaString: '3.00',
          mostPlayedCharacter: { name: '재키', count: 5 },
          tier: '다이아몬드',
          mmr: 2400,
          userNum: 12345,
          characterStats: [
            {
              characterCode: 1,
              totalGames: 5,
              wins: 2,
              top3: 3,
              averageRank: 4,
            },
          ],
        },
        source: 'external',
        refreshedAt: new Date().toISOString(),
      }),
    )

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()
    expect(screen.queryByText(/시즌 집계 응답을 확인하지 못했습니다/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('캐릭터 통계 로딩')).not.toBeInTheDocument()
  })

  it('aggregate 없이도 stats.characterStats를 즉시 표시 (partial)', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery(false))
    usePlayerStatsDTOMock.mockReturnValue(
      idleQuery({
        data: {
          games: 12,
          winRate: 40,
          avgKills: 2,
          avgPlacement: 4,
          kda: 3,
          kdaString: '3.00',
          mostPlayedCharacter: { name: '재키', count: 5 },
          tier: '다이아몬드',
          mmr: 2400,
          userNum: 12345,
          characterStats: [
            {
              characterCode: 1,
              totalGames: 5,
              wins: 2,
              top3: 3,
              averageRank: 4,
            },
          ],
        },
        source: 'external',
        refreshedAt: new Date().toISOString(),
      }),
    )

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('재키')).toBeInTheDocument()
    expect(screen.getByText('시즌 집계 기준')).toBeInTheDocument()
    expect(screen.queryByLabelText('캐릭터 통계 로딩')).not.toBeInTheDocument()
  })

  it('aggregate 없이 matches만 있어도 aggregate 대기 스켈레톤을 표시하지 않음', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(errorQuery(new Error('stats fail')))
    useMatchDTOHistoryMock.mockReturnValue(
      matchesQueryWithPages([
        [
          matchDto({ matchId: 'match-a', seasonNumber: 11 }),
          matchDto({ matchId: 'match-b', seasonNumber: 11 }),
          matchDto({ matchId: 'match-c', seasonNumber: 11 }),
        ],
      ]),
    )

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('최근 3경기 임시 기준')).toBeInTheDocument()
    expect(screen.queryByText('시즌 집계 중')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('캐릭터 통계 로딩')).not.toBeInTheDocument()
  })

  it('이전 시즌은 단일 범위로 seasons를 요청하고 버튼을 표시하지 않음', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery({ ...summaryFixture, hasProfileCache: true }))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    renderProfile(encodeURIComponent('절단마술사'))
    await waitFor(() =>
      expect(usePlayerSeasonsMock).toHaveBeenCalledWith('절단마술사', 1, 11, true),
    )
    expect(screen.queryByRole('button', { name: '이전 시즌 불러오기' })).not.toBeInTheDocument()
  })

  it('URL nickname만으로 summary 요청 hook에 전달', () => {
    usePlayerSummaryMock.mockReturnValue(pendingQuery())
    renderProfile(encodeURIComponent('절단마술사'))
    expect(usePlayerSummaryMock).toHaveBeenCalledWith('절단마술사')
  })

  it('summary 200 external이면 닉네임 렌더링', () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    renderProfile(encodeURIComponent('절단마술사'))
    expect(screen.getByRole('heading', { level: 1, name: '절단마술사' })).toBeInTheDocument()
  })

  it('summary 200인데 stats/seasons 실패해도 프로필은 유지', () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    renderProfile(encodeURIComponent('절단마술사'))
    expect(screen.getByRole('heading', { level: 1, name: '절단마술사' })).toBeInTheDocument()
    expect(screen.getByText(PROFILE_STATS_SECTION_ERROR)).toBeInTheDocument()
  })

  it('real 모드에서는 RP 그래프를 표시하지 않음', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())
    useMatchDTOHistoryMock.mockReturnValue(
      matchesQueryWithPages([
        [
          matchDto({ matchId: 'first-a', seasonNumber: 11, gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: 8000 }),
          matchDto({ matchId: 'first-b', seasonNumber: 11, gameStartedAt: '2026-06-11T10:00:00+09:00', rpAfter: 8100 }),
        ],
      ]),
    )

    renderProfile(encodeURIComponent('절단마술사'))

    expect(await screen.findByText('시즌 집계 기준')).toBeInTheDocument()
    expect(screen.queryByText('랭크 2일 · RP 추이')).not.toBeInTheDocument()
    expect(screen.queryByText('RP 흐름 집계 중')).not.toBeInTheDocument()
    expect(screen.queryByText('RP 흐름 데이터 없음')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('절단마술사', 11),
    )
  })

  it('real 모드에서는 aggregate warming RP 문구를 표시하지 않음', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(screen.queryByText('RP 흐름 집계 중')).not.toBeInTheDocument()
    expect(screen.queryByText(/랭크 RP가 포함된 경기를 수집하면 표시됩니다/)).not.toBeInTheDocument()
  })

  it('real 모드에서는 RP empty 문구를 표시하지 않음', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    usePlayerStatsDTOMock.mockReturnValue(statsWithJack())

    renderProfile(encodeURIComponent('절단마술사'))

    expect(screen.queryByText('RP 흐름 데이터 없음')).not.toBeInTheDocument()
    expect(screen.queryByText(/공식 API 응답에 RP 값이 없는 경기는 그래프에 포함하지 않습니다/)).not.toBeInTheDocument()
  })

  it('summary level이 없으면 matches accountLevel로 real 레벨 표시', () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery({ ...summaryFixture, level: null }))
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
    useMatchDTOHistoryMock.mockReturnValue(
      matchesQueryWithPages([
        [matchDto({ matchId: 'level-a', accountLevel: 394 })],
      ]),
    )

    renderProfile(encodeURIComponent('절단마술사'))

    expect(screen.getByText('Lv.394')).toBeInTheDocument()
    expect(screen.queryByText('Lv.1')).not.toBeInTheDocument()
  })

  it('summary 404(null)이면 not found 메시지', () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(null))
    renderProfile(encodeURIComponent('ghostplayer999'))
    expect(screen.getByText(PROFILE_NOT_FOUND_DESCRIPTION)).toBeInTheDocument()
  })

  it('백엔드 연결 실패면 서버 연결 실패 문구 표시', () => {
    usePlayerSummaryMock.mockReturnValue(errorQuery(new AxiosError('Network Error')))
    renderProfile(encodeURIComponent('절단마술사'))
    expect(
      screen.getByText('백엔드 서버에 연결하지 못했습니다. localhost:3001 실행 상태를 확인해 주세요.'),
    ).toBeInTheDocument()
  })

  it('닉네임 param 없으면 안내 메시지', () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(null))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/player/']}>
          <Routes>
            <Route path="/player/:nickname?" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('닉네임을 입력해 주세요.')).toBeInTheDocument()
  })
})
