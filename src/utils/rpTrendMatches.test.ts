import { describe, expect, it } from 'vitest'

import type { MatchSummary } from '@/types/match'
import { mergeLoadedMatchHistory, selectMatchesForRpTrend } from '@/utils/rpTrendMatches'

function match(partial: Partial<MatchSummary> & Pick<MatchSummary, 'matchId'>): MatchSummary {
  return {
    userNum: 1,
    characterNum: 1,
    characterName: '재키',
    placement: 1,
    kills: 0,
    deaths: 0,
    assists: 0,
    gameStartedAt: '2026-06-10T10:00:00+09:00',
    victory: true,
    ...partial,
  }
}

describe('selectMatchesForRpTrend', () => {
  it('현재 시즌 — 랭크+rpAfter만, 시즌 필터 없음', () => {
    const matches = [
      match({ matchId: 'a', gameMode: 'rank', rpAfter: 8000, seasonNumber: 11 }),
      match({ matchId: 'b', gameMode: 'rank', rpAfter: 8100, seasonNumber: 10 }),
      match({ matchId: 'c', gameMode: 'normal', rpAfter: 9000, seasonNumber: 11 }),
      match({ matchId: 'd', gameMode: 'rank', seasonNumber: 11 }),
    ]

    const selected = selectMatchesForRpTrend(matches, 11, 11)
    expect(selected.map((m) => m.matchId)).toEqual(['a', 'b'])
  })

  it('이전 시즌 — 해당 시즌 랭크만', () => {
    const matches = [
      match({ matchId: 'a', gameMode: 'rank', rpAfter: 8000, seasonNumber: 10 }),
      match({ matchId: 'b', gameMode: 'rank', rpAfter: 8100, seasonNumber: 11 }),
    ]

    const selected = selectMatchesForRpTrend(matches, 10, 11)
    expect(selected.map((m) => m.matchId)).toEqual(['a'])
  })
})

describe('mergeLoadedMatchHistory', () => {
  it('아카이브가 페이지 항목을 덮어씀', () => {
    const paginated = [match({ matchId: 'a', rpAfter: 1000, gameMode: 'rank' })]
    const archive = [match({ matchId: 'a', rpAfter: 2000, gameMode: 'rank' })]

    const merged = mergeLoadedMatchHistory(paginated, archive)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.rpAfter).toBe(2000)
  })
})
