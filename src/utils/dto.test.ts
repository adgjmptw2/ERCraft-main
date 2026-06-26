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
    characterNum: 11,
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
    characterNum: 11,
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
    characterNum: 24,
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
    expect(dto.mostPlayedCharacter.name).toBe('유키')
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

  it('summary tier가 언랭크여도 stats mmr가 있으면 티어를 보강', () => {
    const dto = toStatsDTO({ ...baseStats, mmr: 8308 }, baseMatches, 'Unranked')
    expect(dto.tier).toBe('미스릴')
  })

  it('동률이면 이름 오름차순으로 mostPlayedCharacter 결정', () => {
    const matches: MatchSummary[] = [
      { ...baseMatches[0], characterName: 'Yuki' },
      { ...baseMatches[1], characterName: 'Adela' },
    ]
    const dto = toStatsDTO(baseStats, matches, 'Gold II')
    expect(dto.mostPlayedCharacter.name).toBe('아델라')
  })

  it('owner userNum과 PlayerMatch meta를 DTO에 보존한다', () => {
    const stats: PlayerStats = {
      ...baseStats,
      userNum: 239272700,
      playerMatchCharacterStatsMeta: {
        status: 'complete',
        userNum: 239272700,
        seasonId: 11,
        generatedAt: '2026-01-01T00:00:00.000Z',
        rowCount: 41,
        matchCount: 120,
      },
    }
    const dto = toStatsDTO(stats, baseMatches, 'DIAMOND')
    expect(dto.userNum).toBe(239272700)
    expect(dto.seasonId).toBe(12)
    expect(dto.playerMatchCharacterStatsMeta?.userNum).toBe(239272700)
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

  it('relativeTime은 주입한 now 기준 한국어', () => {
    const now = new Date('2026-04-20T12:00:00.000Z')
    const dto = toMatchSummaryDTO(base, now)
    expect(dto.relativeTime).toBe('2시간 전')
  })

  it('gameDurationLabel은 mm:ss 형식 (zero-pad)', () => {
    const dto = toMatchSummaryDTO({ ...base, gameDuration: 2061 })
    expect(dto.gameDuration).toBe(2061)
    expect(dto.gameDurationLabel).toBe('34:21')
    expect(toMatchSummaryDTO({ ...base, gameDuration: 125 }).gameDurationLabel).toBe('02:05')
  })

  it('매치 행 데모 필드 포함', () => {
    const dto = toMatchSummaryDTO(base)
    expect(dto.playerDamage).toBeGreaterThanOrEqual(5000)
    expect(dto.matchGrade).toMatch(/^[SABCD][+-]?$/)
    expect(['good', 'normal', 'bad']).toContain(dto.teamLuck)
  })

  it('real DTO는 없는 값을 demo 값으로 fallback하지 않음', () => {
    const dto = toMatchSummaryDTO(base, new Date(), { useDemoFallbacks: false })
    expect(dto.teamKill).toBeNull()
    expect(dto.playerDamage).toBeNull()
    expect(dto.rpDeltaValue).toBeNull()
    expect(dto.matchGrade).toBeNull()
    expect(dto.teamLuck).toBeNull()
    expect(dto.teamLuckLabel).toBe('-')
    expect(dto.characterLevel).toBeNull()
    expect(dto.gameDuration).toBeNull()
    expect(dto.gameDurationLabel).toBe('-')
  })

  it('real DTO는 API matchGrade를 유지', () => {
    const dto = toMatchSummaryDTO(
      { ...base, matchGrade: 'A-' },
      new Date(),
      { useDemoFallbacks: false },
    )
    expect(dto.matchGrade).toBe('A-')
  })

  it('코발트 DTO는 API matchGrade가 있어도 제거', () => {
    const dto = toMatchSummaryDTO(
      { ...base, gameMode: 'cobalt', matchGrade: 'S+', cobaltInfusions: [13] },
      new Date(),
      { useDemoFallbacks: false },
    )
    expect(dto.gameMode).toBe('cobalt')
    expect(dto.matchGrade).toBeNull()
  })

  it('real DTO는 전달된 TK/K/딜량/RP/레벨 값을 유지', () => {
    const dto = toMatchSummaryDTO(
      {
        ...base,
        teamKills: 9,
        playerDamage: 12345,
        rpDelta: -18,
        characterLevel: 17,
        gameDuration: 1250,
      },
      new Date(),
      { useDemoFallbacks: false },
    )
    expect(dto.teamKill).toBe(9)
    expect(dto.kills).toBe(4)
    expect(dto.playerDamage).toBe(12345)
    expect(dto.rpDeltaValue).toBe(-18)
    expect(dto.characterLevel).toBe(17)
    expect(dto.gameDurationLabel).toBe('20:50')
  })

  it('gameDuration 미지정 시 matchId 시드로 1200~2400', () => {
    const dto = toMatchSummaryDTO(base)
    expect(dto.gameDuration).toBeGreaterThanOrEqual(1200)
    expect(dto.gameDuration).toBeLessThanOrEqual(2400)
    expect(dto.gameDurationLabel).toMatch(/^\d+:\d{2}$/)
  })

  it('placementLabel은 서수 영어', () => {
    expect(toMatchSummaryDTO({ ...base, placement: 1 }).placementLabel).toBe('1st')
    expect(toMatchSummaryDTO({ ...base, placement: 2 }).placementLabel).toBe('2nd')
    expect(toMatchSummaryDTO({ ...base, placement: 3 }).placementLabel).toBe('3rd')
    expect(toMatchSummaryDTO({ ...base, placement: 4 }).placementLabel).toBe('4th')
    expect(toMatchSummaryDTO({ ...base, placement: 8 }).placementLabel).toBe('8th')
  })

  it('characterNum이 DTO에 유지됨', () => {
    const dto = toMatchSummaryDTO({ ...base, characterNum: 3 })
    expect(dto.characterNum).toBe(3)
  })

  it('gameModeLabel과 RP 표시 규칙', () => {
    expect(toMatchSummaryDTO({ ...base, gameMode: 'rank' }).gameModeLabel).toBe('랭크')
    expect(toMatchSummaryDTO({ ...base, gameMode: 'cobalt' }).gameModeLabel).toBe('코발트')
    expect(toMatchSummaryDTO({ ...base, gameMode: 'union' }).gameModeLabel).toBe('유니온')
    expect(toMatchSummaryDTO({ ...base, gameMode: 'normal' }).gameModeLabel).toBe('일반')
  })

  it('routeLabel — API routeIdOfStart를 표시', () => {
    const dto = toMatchSummaryDTO({
      ...base,
      gameMode: 'rank',
      routeIdOfStart: 12345,
      routeSlotId: 2,
    })
    expect(dto.routeLabel).toBe('루트 #12345')
  })

  it('routeLabel — 미공개·코발트는 루트 -', () => {
    expect(
      toMatchSummaryDTO({
        ...base,
        gameMode: 'normal',
        routeIdOfStart: 2799,
        routeSlotId: -1,
      }).routeLabel,
    ).toBe('루트 -')
    expect(
      toMatchSummaryDTO({
        ...base,
        gameMode: 'cobalt',
        routeIdOfStart: 18412,
        routeSlotId: 1,
      }).routeLabel,
    ).toBe('루트 -')
  })
})
