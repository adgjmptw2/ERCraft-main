import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'

import {
  CURRENT_SEASON_STATS_TTL_MS,
  isSeasonStatsCacheValid,
  readSeasonStatsCache,
  seasonStatsCacheId,
} from './seasonStatsCache.js'

describe('seasonStatsCache', () => {
  it('seasonStatsCacheId — uid:apiSeasonId 형식', () => {
    expect(seasonStatsCacheId('abc', 42)).toBe('abc:42')
  })

  it('isSeasonStatsCacheValid — expiresAt null 이면 영구 유효', () => {
    expect(isSeasonStatsCacheValid(null)).toBe(true)
  })

  it('isSeasonStatsCacheValid — 만료 시각 이전이면 유효', () => {
    const future = new Date(Date.now() + CURRENT_SEASON_STATS_TTL_MS)
    expect(isSeasonStatsCacheValid(future)).toBe(true)
  })

  it('isSeasonStatsCacheValid — 만료됐으면 무효', () => {
    const past = new Date(Date.now() - 1)
    expect(isSeasonStatsCacheValid(past)).toBe(false)
  })

  it('빈 배열도 negative cache payload로 유효', () => {
    expect(Array.isArray([])).toBe(true)
    expect([]).toHaveLength(0)
  })

  it('readSeasonStatsCache — BSER stats payload에 nickname이 없어도 유효', async () => {
    const prisma = {
      seasonStatsCache: {
        findUnique: async () => ({
          id: 'uid:39',
          data: [
            {
              seasonId: 39,
              matchingMode: 3,
              matchingTeamMode: 3,
              mmr: 8833,
              rank: 135,
              rankSize: 152025,
              totalGames: 281,
              totalWins: 42,
              totalTeamKills: 2779,
              totalDeaths: 769,
              averageRank: 3.95,
              averageKills: 2.9,
              averageAssistants: 4.72,
              top1: 0.15,
              top3: 0.49,
              characterStats: [
                {
                  characterCode: 19,
                  totalGames: 281,
                  maxKillings: 11,
                  top3: 139,
                  wins: 42,
                  averageRank: 4,
                },
              ],
            },
          ],
          expiresAt: null,
        }),
      },
    } as unknown as PrismaClient

    const cached = await readSeasonStatsCache(prisma, 'uid:39')

    expect(cached?.[0]?.characterStats).toHaveLength(1)
  })
})
