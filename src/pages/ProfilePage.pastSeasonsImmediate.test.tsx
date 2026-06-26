import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProfilePage } from '@/pages/ProfilePage'
import type { PlayerSummary } from '@/types/player'

const summaryFixture: PlayerSummary = {
  userNum: 12345,
  nickname: '절단마술사',
  level: 100,
  tier: 'DIAMOND2',
  currentSeason: 11,
  hasProfileCache: true,
}

const usePlayerSummaryMock = vi.fn()
const usePlayerStatsDTOMock = vi.fn()
const usePlayerSeasonsMock = vi.fn()
const useMatchDTOHistoryMock = vi.fn()

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
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: 'idle' as const,
    error: null,
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

function emptyMatchesQuery() {
  return {
    data: { pages: [{ data: { items: [], hasNext: false, page: 0, pageSize: 10 }, source: 'cache' }] },
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

const pastSeasonRecord = {
  seasonNumber: 10,
  played: true,
  tier: 'GOLD4',
  rank: { tier: '골드', division: 4, rp: 5000 },
  wins: 5,
  losses: 5,
  avgPlacement: 4.5,
  kda: 2.5,
  top3Rate: 30,
}

function renderProfile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/player/%EC%A0%88%EB%8B%A8%EB%A7%88%EC%88%A0%EC%82%AC']}>
        <Routes>
          <Route path="/player/:nickname" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const currentSeasonRecord = {
  seasonNumber: 11,
  played: true,
  tier: 'GOLD4',
  rank: { tier: '골드', division: 4, rp: 6000 },
  wins: 3,
  losses: 7,
  avgPlacement: 5,
  kda: 3,
  top3Rate: 25,
}

describe('ProfilePage past seasons immediate (39.10F)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePlayerSummaryMock.mockReturnValue(idleQuery(summaryFixture))
    usePlayerStatsDTOMock.mockReturnValue(idleQuery({ data: null, source: 'cache' }))
    useMatchDTOHistoryMock.mockReturnValue(emptyMatchesQuery())
    usePlayerSeasonsMock.mockImplementation(
      (_nick: string, from: number, to: number, enabled: boolean) => {
        if (!enabled) {
          return pendingQuery()
        }
        if (from === 1 && to === 11) {
          return idleQuery({
            currentSeason: 11,
            seasons: [pastSeasonRecord, currentSeasonRecord],
          })
        }
        if (from === 11 && to === 11) {
          return idleQuery({ currentSeason: 11, seasons: [currentSeasonRecord] })
        }
        if (from === 1 && to === 10) {
          return idleQuery({
            currentSeason: 11,
            seasons: [pastSeasonRecord],
          })
        }
        return idleQuery({ currentSeason: 11, seasons: [] })
      },
    )
  })

  it('hasProfileCache=true면 프로필 진입 즉시 full-range seasons(1~11) 요청', async () => {
    renderProfile()

    await waitFor(() => {
      expect(usePlayerSeasonsMock).toHaveBeenCalledWith('절단마술사', 1, 11, true)
    })
    expect(usePlayerSeasonsMock).not.toHaveBeenCalledWith('절단마술사', 11, 11, true)
  })

  it('S10 칩은 비클릭 — 클릭해도 selectedSeason은 S11 유지', async () => {
    const user = userEvent.setup()
    renderProfile()

    const pastChip = await screen.findByLabelText('S10 골드 4')
    const currentButton = screen.getByRole('button', { name: 'S11 골드 4' })
    expect(screen.queryByRole('button', { name: /S10/ })).toBeNull()
    expect(currentButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(pastChip)
    expect(currentButton).toHaveAttribute('aria-pressed', 'true')
  })
})
