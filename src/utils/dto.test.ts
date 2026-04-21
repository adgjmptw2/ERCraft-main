import { describe, expect, it } from 'vitest'

import type { MatchSummary } from '@/types/match'
import type { PlayerStats } from '@/types/player'
import { toMatchSummaryDTO, toStatsDTO } from '@/utils/dto'

const baseStats: PlayerStats = {
  userNum: 1,
  seasonId: 12,
  games: 10,
  wins: 6,
  losses: 4,
  kills: 30,
  deaths: 15,
  assists: 20,
  top3: 5,
  mmr: 2000,
}

const baseMatches: MatchSummary[] = [
  {
    matchId: 'a',
    userNum: 1,
    characterName: 'Yuki',
    placement: 1,
    kills: 5,
    deaths: 2,
    assists: 3,
    gameStartedAt: '2026-04-01T00:00:00.000Z',
    victory: true,
  },
  {
    matchId: 'b',
    userNum: 1,
    characterName: 'Yuki',
    placement: 3,
    kills: 3,
    deaths: 4,
    assists: 2,
    gameStartedAt: '2026-04-02T00:00:00.000Z',
    victory: true,
  },
  {
    matchId: 'c',
    userNum: 1,
    characterName: 'Adela',
    placement: 6,
    kills: 1,
    deaths: 5,
    assists: 1,
    gameStartedAt: '2026-04-03T00:00:00.000Z',
    victory: false,
  },
]

describe('toStatsDTO', () => {
  it('mostPlayedCharacter가 최다 판수 캐릭터', () => {
    const dto = toStatsDTO(baseStats, baseMatches, 'Gold II')
    expect(dto.mostPlayedCharacter.name).toBe('Yuki')
    expect(dto.mostPlayedCharacter.count).toBe(2)
  })

  it('winRate는 0~100 사이', () => {
    const dto = toStatsDTO(baseStats, baseMatches, 'Gold II')
    expect(dto.winRate).toBeGreaterThanOrEqual(0)
    expect(dto.winRate).toBeLessThanOrEqual(100)
    expect(dto.winRate).toBe(60)
  })

  it('deaths=0일 때 kda는 (kills + assists) / 1', () => {
    const stats: PlayerStats = { ...baseStats, kills: 3, deaths: 0, assists: 2 }
    const dto = toStatsDTO(stats, baseMatches, 'Gold II')
    expect(dto.kda).toBe(5)
    expect(dto.kdaString).toBe('5.00')
  })

  it('동률이면 이름 오름차순으로 mostPlayedCharacter 결정', () => {
    const matches: MatchSummary[] = [
      { ...baseMatches[0], characterName: 'Yuki' },
      { ...baseMatches[1], characterName: 'Adela' },
    ]
    const dto = toStatsDTO(baseStats, matches, 'Gold II')
    expect(dto.mostPlayedCharacter.name).toBe('Adela')
  })
})

describe('toMatchSummaryDTO', () => {
  const base: MatchSummary = {
    matchId: 'x',
    userNum: 1,
    characterName: 'Hyunwoo',
    placement: 1,
    kills: 4,
    deaths: 2,
    assists: 2,
    gameStartedAt: '2026-04-20T10:00:00.000Z',
    victory: true,
  }

  it('kdaString은 소수점 둘째 자리 문자열', () => {
    const dto = toMatchSummaryDTO(base)
    expect(dto.kdaString).toBe('3.00')
  })

  it('relativeTime은 주입한 now 기준으로 계산', () => {
    const now = new Date('2026-04-20T12:00:00.000Z')
    const dto = toMatchSummaryDTO(base, now)
    expect(dto.relativeTime).toBe('2h ago')
  })

  it('placementLabel은 서수 영어', () => {
    expect(toMatchSummaryDTO({ ...base, placement: 1 }).placementLabel).toBe('1st')
    expect(toMatchSummaryDTO({ ...base, placement: 2 }).placementLabel).toBe('2nd')
    expect(toMatchSummaryDTO({ ...base, placement: 3 }).placementLabel).toBe('3rd')
    expect(toMatchSummaryDTO({ ...base, placement: 4 }).placementLabel).toBe('4th')
    expect(toMatchSummaryDTO({ ...base, placement: 8 }).placementLabel).toBe('8th')
  })
})
