import { describe, expect, it } from 'vitest'

import type { MatchSummaryDTO } from '@/types/match'
import { filterRecentMatchesByMode } from '@/utils/filterRecentMatchesByMode'

function match(matchId: string, gameMode: MatchSummaryDTO['gameMode']): MatchSummaryDTO {
  return {
    matchId,
    userNum: 1,
    characterNum: 1,
    characterName: '재키',
    placement: 1,
    kills: 1,
    deaths: 0,
    assists: 0,
    gameStartedAt: '2026-06-10T10:00:00+09:00',
    victory: true,
    seasonNumber: 11,
    rpAfter: 8000,
    rpDelta: 10,
    gameDuration: 1200,
    gameDurationLabel: '20:00',
    gameMode: gameMode ?? 'rank',
    gameModeLabel: gameMode ?? 'rank',
    kdaString: '1.00',
    placementLabel: '1st',
    relativeTime: '1일 전',
    teamKill: 5,
    playerDamage: 10000,
    rpDeltaValue: 10,
    matchGrade: null,
    teamLuck: null,
    teamLuckLabel: '-',
    teamLuckIcon: '',
    routeLabel: '루트 -',
    characterLevel: 10,
  }
}

describe('filterRecentMatchesByMode', () => {
  const mixed = [
    match('rank-1', 'rank'),
    match('normal-1', 'normal'),
    match('cobalt-1', 'cobalt'),
    match('rank-2', 'rank'),
  ]

  it('all — 전체 반환', () => {
    expect(filterRecentMatchesByMode(mixed, 'all')).toHaveLength(4)
  })

  it('rank/normal/cobalt — gameMode별 필터', () => {
    expect(filterRecentMatchesByMode(mixed, 'rank').map((row) => row.matchId)).toEqual([
      'rank-1',
      'rank-2',
    ])
    expect(filterRecentMatchesByMode(mixed, 'normal').map((row) => row.matchId)).toEqual([
      'normal-1',
    ])
    expect(filterRecentMatchesByMode(mixed, 'cobalt').map((row) => row.matchId)).toEqual([
      'cobalt-1',
    ])
  })

  it('union — union match만', () => {
    const withUnion = [...mixed, match('union-1', 'union')]
    expect(filterRecentMatchesByMode(withUnion, 'union').map((row) => row.matchId)).toEqual([
      'union-1',
    ])
  })
})
