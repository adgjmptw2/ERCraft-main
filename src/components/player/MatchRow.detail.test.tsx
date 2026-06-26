import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MatchRow } from '@/components/player/MatchRow'
import type { MatchSummaryDTO } from '@/types/match'

const fetchMatchDetailMock = vi.fn()

vi.mock('@/api/matchDetail', () => ({
  fetchMatchDetail: (...args: unknown[]) => fetchMatchDetailMock(...args),
}))

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

const baseMatch: MatchSummaryDTO = {
  matchId: '61599783',
  userNum: 12345,
  characterNum: 1,
  characterName: '유키',
  placement: 3,
  kills: 2,
  deaths: 1,
  assists: 3,
  gameStartedAt: '2026-06-10T10:00:00+09:00',
  victory: true,
  seasonNumber: 11,
  rpAfter: 5800,
  rpDelta: 20,
  gameDuration: 1200,
  gameDurationLabel: '20:00',
  gameMode: 'rank',
  gameModeLabel: '랭크',
  kdaString: '5.00',
  placementLabel: '3rd',
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

describe('MatchRow detail lazy loading', () => {
  it('기본 렌더에서는 detail API를 호출하지 않음', () => {
    fetchMatchDetailMock.mockReset()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ul>
          <MatchRow match={baseMatch} variant="record" />
        </ul>
      </QueryClientProvider>,
    )
    expect(fetchMatchDetailMock).not.toHaveBeenCalled()
  })

  it('row 펼침 시 해당 gameId detail만 호출', async () => {
    fetchMatchDetailMock.mockResolvedValue({
      data: {
        gameId: '61599783',
        gameMode: 'rank',
        playedAt: new Date().toISOString(),
        detailStatus: 'ready',
        teams: [],
      },
      source: 'external',
      refreshedAt: new Date().toISOString(),
    })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ul>
          <MatchRow match={baseMatch} variant="record" />
        </ul>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: '매치 상세 펼치기' }))
    await screen.findByText(/경기 #61599783/)
    expect(fetchMatchDetailMock).toHaveBeenCalledTimes(1)
    expect(fetchMatchDetailMock).toHaveBeenCalledWith('61599783')
  })
})
