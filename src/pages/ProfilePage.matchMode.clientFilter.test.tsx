import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProfilePage } from '@/pages/ProfilePage'
import type { PlayerSummary } from '@/types/player'
import {
  MATCH_HISTORY_MODE_EMPTY_MESSAGE,
  matchHistoryFilteredEmptyMessage,
} from '@/types/matchMode'
import type { MatchSummaryDTO } from '@/types/match'

const summaryFixture: PlayerSummary = {
  userNum: 12345,
  nickname: 'fencing',
  level: 100,
  tier: 'DIAMOND2',
  currentSeason: 11,
  hasProfileCache: true,
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

function matchRow(matchId: string, gameMode: MatchSummaryDTO['gameMode']): MatchSummaryDTO {
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
    seasonNumber: 11,
    rpAfter: 8000,
    rpDelta: 20,
    gameDuration: 1200,
    gameDurationLabel: '20:00',
    gameMode: gameMode ?? 'rank',
    gameModeLabel: gameMode ?? 'rank',
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
  }
}

const mixedMatches = [
  matchRow('m-rank-1', 'rank'),
  matchRow('m-normal-1', 'normal'),
  matchRow('m-cobalt-1', 'cobalt'),
  matchRow('m-rank-2', 'rank'),
]

function matchesQueryResult(items: MatchSummaryDTO[] = mixedMatches, hasNext = true) {
  return {
    ...idleQuery({
      pages: [{ data: { items, page: 0, pageSize: 10, hasNext }, source: 'cache' }],
      pageParams: [0],
    }),
    isFetchingNextPage: false,
    hasNextPage: hasNext,
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

describe('39.10J recent match mode client filter', () => {
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
          playerMatchCharacterStats: [
            {
              characterNum: 10,
              characterName: '재키',
              games: 10,
              wins: 3,
              winRate: 30,
              avgRank: 4,
              kills: 20,
              assists: 10,
              deaths: 5,
              kda: 4,
              avgTeamKills: 8,
              avgKills: 2,
              avgDamage: 12000,
              gradeLabel: 'A',
            },
          ],
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
    getPlayerSeasonAggregateMock.mockResolvedValue({ data: null })
    useMatchDTOHistoryMock.mockImplementation((_nick: string, enabled: boolean, mode = 'all') => {
      if (!enabled) return matchesQueryResult([], false)
      return matchesQueryResult(
        mode === 'all' ? mixedMatches : mixedMatches.filter((match) => match.gameMode === mode),
      )
    })
  })

  it('초기 진입 시 all + selected mode query hook', () => {
    renderProfile('/player/fencing')
    expect(useMatchDTOHistoryMock).toHaveBeenCalledWith('fencing', expect.any(Boolean), 'all')
    expect(useMatchDTOHistoryMock.mock.calls.every((call) => call.length === 3)).toBe(true)
  })

  it('mode 변경 시 matchMode 서버 query 분기', async () => {
    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'fencing' })).toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: '랭크' }))
    await user.click(screen.getByRole('tab', { name: '일반' }))
    await user.click(screen.getByRole('tab', { name: '코발트' }))
    await user.click(screen.getByRole('tab', { name: '유니온' }))
    await user.click(screen.getByRole('tab', { name: '전체' }))

    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'rank')).toBe(true)
    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'normal')).toBe(true)
    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'cobalt')).toBe(true)
    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'union')).toBe(true)
    expect(getPlayerSeasonAggregateMock).toHaveBeenCalledWith('fencing', 11)
    expect(getPlayerSeasonAggregateMock).toHaveBeenCalledTimes(1)
  })

  it('mode별 클라이언트 필터 — 즉시 visible list 변경', async () => {
    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'fencing' })).toBeInTheDocument())

    const matchRows = () => document.querySelectorAll('ul.divide-y > li')
    await waitFor(() => expect(matchRows()).toHaveLength(4))

    await user.click(screen.getByRole('tab', { name: '랭크' }))
    expect(matchRows()).toHaveLength(2)

    await user.click(screen.getByRole('tab', { name: '코발트' }))
    expect(matchRows()).toHaveLength(1)

    await user.click(screen.getByRole('tab', { name: '전체' }))
    expect(matchRows()).toHaveLength(4)
  })

  it('mode 변경 중 match list 즉시 유지 — skeleton 없음', async () => {
    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await waitFor(() => expect(document.querySelectorAll('ul.divide-y > li').length).toBe(4))

    await user.click(screen.getByRole('tab', { name: '랭크' }))
    expect(document.querySelectorAll('ul.divide-y > li').length).toBe(2)
  })

  it('union mode — DB empty 안내 즉시 표시', async () => {
    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await user.click(screen.getByRole('tab', { name: '유니온' }))
    expect(await screen.findByText(MATCH_HISTORY_MODE_EMPTY_MESSAGE)).toBeInTheDocument()
  })

  it('mode별 empty state — 추가 fetch 없이 안내', async () => {
    useMatchDTOHistoryMock.mockImplementation((_nick: string, enabled: boolean, mode = 'all') => {
      if (!enabled) return matchesQueryResult([], false)
      if (mode === 'cobalt') return matchesQueryResult([], false)
      return matchesQueryResult([matchRow('m-rank-only', 'rank')], false)
    })

    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await waitFor(() => expect(document.querySelectorAll('ul.divide-y > li').length).toBe(1))

    await user.click(screen.getByRole('tab', { name: '코발트' }))
    expect(
      await screen.findByText(matchHistoryFilteredEmptyMessage('cobalt')!),
    ).toBeInTheDocument()
    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'cobalt')).toBe(true)
  })

  it('더 보기 — 선택 mode 다음 page 로드', async () => {
    const fetchNextPage = vi.fn()
    useMatchDTOHistoryMock.mockImplementation((_nick: string, enabled: boolean, mode = 'all') => {
      const items =
        enabled && mode === 'cobalt'
          ? mixedMatches.filter((match) => match.gameMode === 'cobalt')
          : mode === 'all'
            ? mixedMatches
            : []
      return {
        ...matchesQueryResult(items, true),
        hasNextPage: true,
        fetchNextPage,
      }
    })

    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'fencing' })).toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: '코발트' }))
    expect(screen.getByRole('tab', { name: '코발트', selected: true })).toBeInTheDocument()
    expect(document.querySelectorAll('ul.divide-y > li').length).toBe(1)

    await user.click(screen.getByRole('button', { name: '더 보기' }))
    expect(fetchNextPage.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(useMatchDTOHistoryMock.mock.calls.some((call) => call[2] === 'cobalt')).toBe(true)
  })

  it('mode 변경해도 분석 표본·캐릭터 라벨 유지', async () => {
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
          characterStats: [],
          playerMatchCharacterStats: [
            {
              characterNum: 10,
              characterName: '재키',
              games: 808,
              wins: 200,
              winRate: 25,
              avgRank: 4,
              kills: 100,
              assists: 50,
              deaths: 30,
              kda: 5,
              avgTeamKills: 8,
              avgKills: 2,
              avgDamage: 12000,
              gradeLabel: 'A',
            },
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
    expect(within(analysisPanel).getByText(/표본 808전 · 신뢰도 높음/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '전적' }))
    await user.click(screen.getByRole('tab', { name: '랭크' }))
    await user.click(screen.getByRole('tab', { name: '분석' }))
    expect(within(analysisPanel).getByText(/표본 808전 · 신뢰도 높음/)).toBeInTheDocument()
    expect(screen.queryByText('PlayerMatch 집계 기준')).not.toBeInTheDocument()
  })

  it('다른 유저 이동 시 mode all로 reset', async () => {
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
          playerMatchCharacterStats: [],
        },
        source: 'cache',
      }),
    )
    const user = userEvent.setup()
    renderProfile('/player/fencing')
    await user.click(screen.getByRole('tab', { name: '랭크' }))
    await user.click(screen.getByRole('button', { name: 'go 연서' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '연서' })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: '전체', selected: true })).toBeInTheDocument()
  })

  it('이전 시즌 안내 배너 미표시', async () => {
    renderProfile('/player/fencing')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'fencing' })).toBeInTheDocument())
    expect(
      screen.queryByText('이전 시즌은 티어 기록만 제공합니다. 전적·분석은 현재 시즌 기준입니다.'),
    ).not.toBeInTheDocument()
  })
})
