import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'

import {
  isSeasonAggregateCacheValid,
  readSeasonAggregateCache,
  seasonAggregateCacheId,
  writeSeasonAggregateCache,
} from './seasonAggregateCache.js'

describe('seasonAggregateCache', () => {
  it('seasonAggregateCacheId — uid:apiSeasonId 형식', () => {
    expect(seasonAggregateCacheId('uid-1', 39)).toBe('uid-1:39')
  })

  it('isSeasonAggregateCacheValid — warming은 응답 캐시로 사용하지 않음', () => {
    const future = new Date(Date.now() + 60_000)
    expect(isSeasonAggregateCacheValid(future, 'warming')).toBe(false)
  })

  it('isSeasonAggregateCacheValid — expiresAt null이면 유효', () => {
    expect(isSeasonAggregateCacheValid(null, 'ready')).toBe(true)
  })

  it('isSeasonAggregateCacheValid — 만료됐으면 무효', () => {
    const past = new Date(Date.now() - 60_000)
    expect(isSeasonAggregateCacheValid(past, 'ready')).toBe(false)
  })

  it('readSeasonAggregateCache — 테이블 미적용이면 null로 degrade', async () => {
    const prisma = {
      seasonAggregateCache: {
        findUnique: async () => {
          throw {
            code: 'P2021',
            message: 'The table season_aggregate_cache does not exist in the current database.',
          }
        },
      },
    } as unknown as PrismaClient

    await expect(readSeasonAggregateCache(prisma, 'uid:39')).resolves.toBeNull()
  })

  it('writeSeasonAggregateCache — 더 작은 partial aggregate는 ready cache를 덮어쓰지 않음', async () => {
    const existing = {
      id: 'uid:39',
      uid: 'uid',
      userNum: 1n,
      apiSeasonId: 39,
      displaySeasonId: 11,
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
      ],
      rpSeries: [{ matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8000 }],
      cachedAt: new Date(),
      lastRefreshedAt: new Date('2026-06-13T00:00:00.000Z'),
      expiresAt: new Date(Date.now() + 60_000),
    }
    let upsertCalled = false
    const prisma = {
      seasonAggregateCache: {
        findUnique: async () => existing,
        upsert: async () => {
          upsertCalled = true
        },
      },
    } as unknown as PrismaClient

    const result = await writeSeasonAggregateCache(prisma, 'uid', {
      userNum: 1,
      seasonId: 11,
      apiSeasonId: 39,
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
      rpSeries: [],
      lastRefreshedAt: '2026-06-14T00:00:00.000Z',
    })

    expect(result).toBe('skipped')
    expect(upsertCalled).toBe(false)
  })

  it('writeSeasonAggregateCache — collectedGames가 줄어드는 write는 skip', async () => {
    const existing = {
      id: 'uid:39',
      uid: 'uid',
      userNum: 1n,
      apiSeasonId: 39,
      displaySeasonId: 11,
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
      rpSeries: [],
      cachedAt: new Date(),
      lastRefreshedAt: new Date('2026-06-13T00:00:00.000Z'),
      expiresAt: new Date(Date.now() + 60_000),
    }
    let upsertCalled = false
    const prisma = {
      seasonAggregateCache: {
        findUnique: async () => existing,
        upsert: async () => {
          upsertCalled = true
        },
      },
    } as unknown as PrismaClient

    const result = await writeSeasonAggregateCache(prisma, 'uid', {
      userNum: 1,
      seasonId: 11,
      apiSeasonId: 39,
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
      rpSeries: [],
      lastRefreshedAt: '2026-06-14T00:00:00.000Z',
      coverage: {
        officialSeasonGames: 280,
        collectedGames: 12,
        characterCount: 1,
        rpPointCount: 0,
        coverageRatio: 0.04,
      },
    })

    expect(result).toBe('skipped')
    expect(upsertCalled).toBe(false)
  })

  it('writeSeasonAggregateCache — 테이블 미적용이면 write를 건너뜀', async () => {
    const prisma = {
      seasonAggregateCache: {
        findUnique: async () => null,
        upsert: async () => {
          throw {
            code: 'P2021',
            message: 'The table season_aggregate_cache does not exist in the current database.',
          }
        },
      },
    } as unknown as PrismaClient

    await expect(
      writeSeasonAggregateCache(prisma, 'uid', {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 39,
        cacheStatus: 'partial',
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: '2026-06-13T00:00:00.000Z',
      }),
    ).resolves.toBe('unavailable')
  })
})
