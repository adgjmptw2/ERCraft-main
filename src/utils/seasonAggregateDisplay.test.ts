import { describe, expect, it } from 'vitest'

import type { PlayerSeasonAggregateDTO } from '@/types/player'
import {
  isSeasonAggregateDisplayDowngrade,
  isSeasonAggregateDisplayUpgrade,
  formatSeasonAggregateCoverageText,
  resolveProfileSeasonAggregate,
  seasonAggregateProfileKey,
  seasonAggregateStashKey,
} from '@/utils/seasonAggregateDisplay'

function aggregate(
  overrides: Partial<PlayerSeasonAggregateDTO> = {},
): PlayerSeasonAggregateDTO {
  return {
    userNum: 456147087,
    seasonId: 11,
    apiSeasonId: 39,
    cacheStatus: 'ready',
    source: 'mixed',
    basisLabel: '시즌 전체 랭크 경기 기준',
    isRefreshing: false,
    characterStats: [
      {
        characterNum: 31,
        games: 182,
        wins: 18,
        winRate: 10,
        avgRank: 4,
        kills: 300,
        assists: 400,
        deaths: 200,
        kda: 3.5,
        avgTeamKills: 8,
        avgKills: 2.5,
        avgDamage: 13000,
        gradeLabel: 'A',
      },
    ],
    rpSeries: [
      { matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 6500 },
      { matchId: 'm-2', dateLabel: '6. 11.', rpAfter: 6563 },
    ],
    lastRefreshedAt: new Date().toISOString(),
    coverage: {
      officialSeasonGames: 798,
      collectedGames: 784,
      characterCount: 40,
      rpPointCount: 7,
      coverageRatio: 0.98,
    },
    ...overrides,
  }
}

describe('seasonAggregateDisplay', () => {
  it('profileKey는 nickname/userNum/seasonId 조합', () => {
    expect(seasonAggregateProfileKey('연서', 456147087, 11)).toBe('연서:456147087:11')
  })

  it('stashKey는 nickname+seasonId만 사용', () => {
    expect(seasonAggregateStashKey('연서', 11)).toBe('연서:11')
  })

  it('rpSeries downgrade 감지', () => {
    const previous = aggregate()
    const next = aggregate({
      rpSeries: [],
      coverage: {
        officialSeasonGames: 798,
        collectedGames: 798,
        characterCount: 40,
        rpPointCount: 0,
        coverageRatio: 1,
      },
    })

    expect(isSeasonAggregateDisplayDowngrade(next, previous)).toBe(true)
  })

  it('combat-sparse characterStats downgrade 감지', () => {
    const previous = aggregate()
    const next = aggregate({
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 0,
          assists: 0,
          deaths: 0,
          kda: Number.NaN,
          avgTeamKills: null,
          avgKills: Number.NaN,
          avgDamage: null,
          gradeLabel: '시즌',
        },
      ],
      rpSeries: [],
    })

    expect(isSeasonAggregateDisplayDowngrade(next, previous)).toBe(true)
  })

  it('coverage collectedGames가 저장분보다 줄면 downgrade로 유지', () => {
    const previous = aggregate({
      characterStats: [],
      rpSeries: [],
      coverage: {
        officialSeasonGames: 71,
        collectedGames: 68,
        characterCount: 0,
        rpPointCount: 0,
        coverageRatio: 0.96,
      },
    })
    const next = aggregate({
      characterStats: [],
      rpSeries: [],
      coverage: {
        officialSeasonGames: 71,
        collectedGames: 0,
        characterCount: 0,
        rpPointCount: 0,
        coverageRatio: 0,
      },
    })

    expect(isSeasonAggregateDisplayDowngrade(next, previous)).toBe(true)
  })

  it('coverage 문구는 DB 저장 경기 수와 남은 경기 수를 표시', () => {
    expect(
      formatSeasonAggregateCoverageText(
        aggregate({
          coverage: {
            officialSeasonGames: 71,
            collectedGames: 68,
            characterCount: 3,
            rpPointCount: 68,
            coverageRatio: 0.96,
          },
        }),
      ),
    ).toBe('저장된 68전 표시 중 · 새 기록 3전 확인 중')
  })

  it('더 풍부한 refetch는 upgrade로 판정', () => {
    const previous = aggregate({ rpSeries: [] })
    const next = aggregate()

    expect(isSeasonAggregateDisplayUpgrade(next, previous)).toBe(true)
  })

  it('refetch mismatch 시 lastValid aggregate 유지', () => {
    const lastValid = aggregate()
    const mismatched = aggregate({ userNum: 111, seasonId: 10 })

    const resolved = resolveProfileSeasonAggregate({
      raw: mismatched,
      summaryUserNum: 456147087,
      selectedSeason: 11,
      lastValid,
    })

    expect(resolved.aggregate).toEqual(lastValid)
    expect(resolved.pickReason).toBe('reject-mismatch')
  })

  it('nickname/userNum 변경 시 lastValid를 재사용하지 않음', () => {
    const lastValid = aggregate()
    const oldKey = seasonAggregateStashKey('연서', 11)
    const newKey = seasonAggregateStashKey('fencing', 11)

    expect(oldKey).not.toBe(newKey)

    const resolved = resolveProfileSeasonAggregate({
      raw: aggregate({ userNum: 12345 }),
      summaryUserNum: 12345,
      selectedSeason: 11,
      lastValid: oldKey === newKey ? lastValid : null,
    })

    expect(resolved.aggregate?.userNum).toBe(12345)
  })

  it('downgrade raw는 lastValid 유지', () => {
    const lastValid = aggregate()
    const downgraded = aggregate({
      rpSeries: [],
      coverage: {
        officialSeasonGames: 798,
        collectedGames: 798,
        characterCount: 40,
        rpPointCount: 0,
        coverageRatio: 1,
      },
    })

    const resolved = resolveProfileSeasonAggregate({
      raw: downgraded,
      summaryUserNum: 456147087,
      selectedSeason: 11,
      lastValid,
    })

    expect(resolved.aggregate?.rpSeries).toHaveLength(2)
    expect(resolved.pickReason).toBe('reject-downgrade')
  })

  it('canonical uid drift + sparse refetch는 stash 유지', () => {
    const lastValid = aggregate()
    const sparseCanonical = aggregate({
      userNum: 999999999,
      rpSeries: [],
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 0,
          assists: 0,
          deaths: 0,
          kda: Number.NaN,
          avgTeamKills: null,
          avgKills: Number.NaN,
          avgDamage: null,
          gradeLabel: '시즌',
        },
      ],
    })

    const resolved = resolveProfileSeasonAggregate({
      raw: sparseCanonical,
      summaryUserNum: 999999999,
      selectedSeason: 11,
      lastValid,
    })

    expect(resolved.aggregate?.rpSeries).toHaveLength(2)
    expect(resolved.pickReason).toBe('reject-downgrade')
  })
})
