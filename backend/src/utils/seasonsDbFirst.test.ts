import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { PrismaClient } from '@prisma/client'

import {
  buildSeasonsGridFromStatsCache,
  withSeasonsPartialStatus,
} from './seasonsDbFirst.js'

vi.mock('../cache/seasonStatsCache.js', () => ({
  readSeasonStatsCache: vi.fn(),
  seasonStatsCacheId: (uid: string, apiSeasonId: number) => `${uid}:${apiSeasonId}`,
}))

const { readSeasonStatsCache } = await import('../cache/seasonStatsCache.js')

const catalog = {
  apiIdForDisplay: (display: number) => (display === 11 ? 20 : display === 10 ? 19 : null),
  currentDisplaySeason: () => 11,
  currentApiSeasonIdOrNull: () => 20,
} as never

describe('seasonsDbFirst', () => {
  beforeEach(() => {
    vi.mocked(readSeasonStatsCache).mockReset()
  })

  it('buildSeasonsGridFromStatsCache - DB stats only grid', async () => {
    vi.mocked(readSeasonStatsCache).mockImplementation(async (prisma, id) => {
      void prisma
      if (id === 'uid-test:19') {
        return [
          {
            seasonId: 19,
            matchingMode: 3,
            matchingTeamMode: 3,
            mmr: 5000,
            totalGames: 10,
            win: 5,
            lose: 5,
            rank: 0,
            kill: 20,
            death: 10,
            assist: 5,
            top3: 3,
          },
        ] as never
      }
      return []
    })

    const body = await buildSeasonsGridFromStatsCache(
      {} as PrismaClient,
      'uid-test',
      10,
      10,
      11,
      catalog,
    )
    expect(body).not.toBeNull()
    expect(body?.seasons[0]?.played).toBe(true)
    expect(body?.seasons[0]?.seasonNumber).toBe(10)
  })

  it('withSeasonsPartialStatus - partial flag', () => {
    const body = {
      currentSeason: 11,
      seasons: [],
    }
    expect(withSeasonsPartialStatus(body, false).status).toBeUndefined()
    expect(withSeasonsPartialStatus(body, true).status).toBe('partial')
  })
})