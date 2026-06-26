import { describe, expect, it } from 'vitest'

import type { PlayerSeasonAggregateContract } from '../contracts/player.js'
import {
  pickSeasonAggregateResponseBody,
  seasonAggregateHasMoreInformation,
  seasonAggregateIsDowngrade,
  seasonAggregateShouldReplaceCache,
  seasonAggregateWriteSkipReason,
} from './seasonAggregateCompare.js'

function aggregate(
  overrides: Partial<PlayerSeasonAggregateContract> = {},
): PlayerSeasonAggregateContract {
  return {
    userNum: 123456,
    seasonId: 11,
    apiSeasonId: 39,
    cacheStatus: 'ready',
    characterStats: [
      {
        characterNum: 19,
        games: 10,
        wins: 3,
        winRate: 30,
        avgRank: 4,
        kills: 20,
        assists: 30,
        deaths: 10,
        kda: 5,
        avgTeamKills: 8,
        avgKills: 2,
        avgDamage: 12000,
        gradeLabel: null,
      },
    ],
    rpSeries: [{ matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8000 }],
    lastRefreshedAt: '2026-06-13T00:00:00.000Z',
    coverage: {
      officialSeasonGames: 280,
      collectedGames: 10,
      characterCount: 1,
      rpPointCount: 1,
      coverageRatio: 0.04,
    },
    ...overrides,
  }
}

describe('seasonAggregateCompare', () => {
  it('collectedGames-only rebuild는 downgrade로 판정', () => {
    const cached = aggregate({
      rpSeries: [
        { matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 6500 },
        { matchId: 'm-2', dateLabel: '6. 11.', rpAfter: 6563 },
      ],
      coverage: {
        officialSeasonGames: 798,
        collectedGames: 784,
        characterCount: 40,
        rpPointCount: 7,
        coverageRatio: 0.98,
      },
    })
    const rebuilt = aggregate({
      rpSeries: [],
      coverage: {
        officialSeasonGames: 798,
        collectedGames: 798,
        characterCount: 40,
        rpPointCount: 0,
        coverageRatio: 1,
      },
    })

    expect(seasonAggregateIsDowngrade(rebuilt, cached)).toBe(true)
    expect(seasonAggregateHasMoreInformation(rebuilt, cached)).toBe(false)
    expect(pickSeasonAggregateResponseBody(rebuilt, cached)).toEqual(cached)
    expect(rebuilt.rpSeries.length).toBe(0)
  })

  it('seasonAggregateHasMoreInformation — characterStats games 합 증가 감지', () => {
    const current = aggregate({
      characterStats: [
        {
          characterNum: 19,
          games: 5,
          wins: 1,
          winRate: 20,
          avgRank: 5,
          kills: 10,
          assists: 10,
          deaths: 5,
          kda: 4,
          avgTeamKills: 7,
          avgKills: 2,
          avgDamage: 9000,
          gradeLabel: null,
        },
      ],
    })
    const next = aggregate({
      characterStats: [
        {
          characterNum: 19,
          games: 12,
          wins: 4,
          winRate: 33,
          avgRank: 4,
          kills: 20,
          assists: 20,
          deaths: 10,
          kda: 4,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 10000,
          gradeLabel: null,
        },
      ],
    })
    expect(seasonAggregateHasMoreInformation(next, current)).toBe(true)
  })

  it('ready/full cache를 partial aggregate가 덮어쓰지 않음', () => {
    const existing = aggregate({
      cacheStatus: 'ready',
      characterStats: [
        {
          characterNum: 19,
          games: 120,
          wins: 40,
          winRate: 33,
          avgRank: 4,
          kills: 200,
          assists: 300,
          deaths: 100,
          kda: 5,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 12000,
          gradeLabel: 'A',
        },
        {
          characterNum: 17,
          games: 80,
          wins: 20,
          winRate: 25,
          avgRank: 5,
          kills: 120,
          assists: 180,
          deaths: 80,
          kda: 3.75,
          avgTeamKills: 7,
          avgKills: 1.5,
          avgDamage: 10000,
          gradeLabel: 'B',
        },
      ],
      coverage: {
        officialSeasonGames: 280,
        collectedGames: 200,
        characterCount: 2,
        rpPointCount: 40,
        coverageRatio: 0.71,
      },
    })
    const partial = aggregate({
      cacheStatus: 'partial',
      characterStats: [
        {
          characterNum: 19,
          games: 12,
          wins: 4,
          winRate: 33,
          avgRank: 4,
          kills: 20,
          assists: 30,
          deaths: 10,
          kda: 5,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 12000,
          gradeLabel: null,
        },
      ],
      coverage: {
        officialSeasonGames: 280,
        collectedGames: 12,
        characterCount: 1,
        rpPointCount: 2,
        coverageRatio: 0.04,
      },
    })

    expect(seasonAggregateShouldReplaceCache(partial, existing)).toBe(false)
  })

  it('같은 collectedGames에서 캐릭터 수가 늘면 교체 허용', () => {
    const existing = aggregate({
      cacheStatus: 'partial',
      characterStats: [
        {
          characterNum: 19,
          games: 12,
          wins: 4,
          winRate: 33,
          avgRank: 4,
          kills: 20,
          assists: 30,
          deaths: 10,
          kda: 5,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 12000,
          gradeLabel: null,
        },
      ],
    })
    const next = aggregate({
      cacheStatus: 'partial',
      characterStats: [
        existing.characterStats[0]!,
        {
          characterNum: 17,
          games: 8,
          wins: 2,
          winRate: 25,
          avgRank: 5,
          kills: 10,
          assists: 12,
          deaths: 6,
          kda: 3.67,
          avgTeamKills: 7,
          avgKills: 1.25,
          avgDamage: 9000,
          gradeLabel: null,
        },
      ],
      coverage: {
        officialSeasonGames: 280,
        collectedGames: 20,
        characterCount: 2,
        rpPointCount: 2,
        coverageRatio: 0.07,
      },
    })

    expect(seasonAggregateShouldReplaceCache(next, existing)).toBe(true)
  })

  it('warming/stale incoming은 ready existing을 덮어쓰지 않음', () => {
    const existing = aggregate({ cacheStatus: 'ready' })
    expect(seasonAggregateShouldReplaceCache(aggregate({ cacheStatus: 'warming' }), existing)).toBe(
      false,
    )
    expect(seasonAggregateShouldReplaceCache(aggregate({ cacheStatus: 'partial' }), existing)).toBe(
      false,
    )
  })

  it('same collectedGames라도 games 합이 줄면 skip reason을 반환', () => {
    const existing = aggregate({
      cacheStatus: 'partial',
      characterStats: [
        {
          characterNum: 19,
          games: 40,
          wins: 10,
          winRate: 25,
          avgRank: 4,
          kills: 80,
          assists: 100,
          deaths: 40,
          kda: 4.5,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 12000,
          gradeLabel: null,
        },
      ],
      coverage: {
        officialSeasonGames: 280,
        collectedGames: 40,
        characterCount: 1,
        rpPointCount: 2,
        coverageRatio: 0.14,
      },
    })
    const incoming = aggregate({
      cacheStatus: 'partial',
      characterStats: [
        {
          characterNum: 19,
          games: 12,
          wins: 4,
          winRate: 33,
          avgRank: 4,
          kills: 20,
          assists: 30,
          deaths: 10,
          kda: 5,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 12000,
          gradeLabel: null,
        },
      ],
      coverage: {
        officialSeasonGames: 280,
        collectedGames: 40,
        characterCount: 1,
        rpPointCount: 2,
        coverageRatio: 0.14,
      },
    })

    expect(seasonAggregateShouldReplaceCache(incoming, existing)).toBe(false)
    expect(seasonAggregateWriteSkipReason(incoming, existing)).toBe('existing-more-games')
  })
})
