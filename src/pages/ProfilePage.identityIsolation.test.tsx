import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProfilePage } from '@/pages/ProfilePage'
import type { PlayerSummary } from '@/types/player'
import type { PlayerStatsDTO } from '@/types/player'
import { PROFILE_IDENTITY_MISMATCH_MESSAGE } from '@/utils/profileIdentityMessage'
import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

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

const PLAYER_A: PlayerSummary = {
  userNum: 100001,
  nickname: '아드마이할게요',
  level: 90,
  tier: 'Mithril',
  currentSeason: 11,
}

const PLAYER_B: PlayerSummary = {
  userNum: 200002,
  nickname: 'gapri',
  level: 120,
  tier: 'DIAMOND2',
  currentSeason: 11,
}

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
  }
}

function statsDtoFor(userNum: number, characterName: string) {
  return idleQuery({
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
          characterNum: 19,
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
        status: 'complete' as const,
        userNum,
        seasonId: 11,
        generatedAt: '2026-06-20T00:00:00.000Z',
        rowCount: 1,
        matchCount: 20,
      },
    } satisfies PlayerStatsDTO,
    source: 'cache' as const,
    refreshedAt: '2026-06-20T00:00:00.000Z',
  })
}

describe('ProfilePage identity isolation', () => {
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
    usePlayerSeasonsMock.mockReturnValue(idleQuery({ currentSeason: 11, seasons: [] }))
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

  it('시나리오 B: summary nickname 불일치 시 다른 플레이어 프로필을 렌더링하지 않는다', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(PLAYER_B))
    usePlayerStatsDTOMock.mockReturnValue(statsDtoFor(PLAYER_B.userNum, '재키'))

    renderAt(`/player/${encodeURIComponent(PLAYER_A.nickname)}`)

    expect(await screen.findByText(PROFILE_IDENTITY_MISMATCH_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: PLAYER_B.nickname })).not.toBeInTheDocument()
    expect(screen.queryByText('재키')).not.toBeInTheDocument()
  })

  it('시나리오 E: summary A + stats B userNum이면 partial render를 차단한다', async () => {
    usePlayerSummaryMock.mockReturnValue(idleQuery(PLAYER_A))
    usePlayerStatsDTOMock.mockReturnValue(statsDtoFor(PLAYER_B.userNum, '재키'))

    renderAt(`/player/${encodeURIComponent(PLAYER_A.nickname)}`)

    expect(await screen.findByText(PROFILE_IDENTITY_MISMATCH_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('재키')).not.toBeInTheDocument()
  })

  it('시나리오 A: queryKey가 nickname·UID별로 분리된다', () => {
    const scopeA = playerQueryOwnerScope({
      nickname: PLAYER_A.nickname,
      userNum: PLAYER_A.userNum,
      dataSource: 'real',
    })
    const scopeB = playerQueryOwnerScope({
      nickname: PLAYER_B.nickname,
      userNum: PLAYER_B.userNum,
      dataSource: 'real',
    })
    expect(playerQueryKeys.summary(playerQueryOwnerScope({ nickname: PLAYER_A.nickname, dataSource: 'real' }))).not.toEqual(
      playerQueryKeys.summary(playerQueryOwnerScope({ nickname: PLAYER_B.nickname, dataSource: 'real' })),
    )
    expect(playerQueryKeys.statsDto(scopeA, '')).not.toEqual(playerQueryKeys.statsDto(scopeB, ''))
  })

  it('gapri → 아드마이할게요 전환 시 B 프로필이 A 화면에 남지 않는다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    usePlayerSummaryMock.mockImplementation((nickname: string) => {
      if (nickname === PLAYER_B.nickname) return idleQuery(PLAYER_B)
      if (nickname === PLAYER_A.nickname) return idleQuery(PLAYER_A)
      return idleQuery(undefined)
    })
    usePlayerStatsDTOMock.mockImplementation((nickname: string) => {
      if (nickname === PLAYER_B.nickname) return statsDtoFor(PLAYER_B.userNum, '재키')
      if (nickname === PLAYER_A.nickname) {
        return {
          ...idleQuery(undefined),
          isPending: true,
          isFetching: true,
          fetchStatus: 'fetching' as const,
          status: 'pending' as const,
        }
      }
      return idleQuery(undefined)
    })

    const router = createMemoryRouter(
      [{ path: '/player/:nickname', element: <ProfilePage /> }],
      { initialEntries: [`/player/${encodeURIComponent(PLAYER_B.nickname)}`] },
    )

    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { level: 1, name: PLAYER_B.nickname })).toBeInTheDocument()
    await router.navigate(`/player/${encodeURIComponent(PLAYER_A.nickname)}`)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: PLAYER_A.nickname })).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { level: 1, name: PLAYER_B.nickname })).not.toBeInTheDocument()
  })
})
