import { describe, expect, it } from 'vitest'

import {
  isMatchesCacheValid,
  matchesCacheId,
  MATCHES_CACHE_TTL_MS,
  readMatchesCache,
  readMatchesCacheSnapshot,
} from './matchesCache.js'
import type { PrismaClient } from '@prisma/client'

describe('matchesCache', () => {
  it('matchesCacheId — uid:0 형식', () => {
    expect(matchesCacheId('abc')).toBe('abc:0')
  })

  it('matchesCacheId — rank mode', () => {
    expect(matchesCacheId('abc', 'rank')).toBe('abc:rank')
  })

  it('isMatchesCacheValid — 만료 시각 이전이면 유효', () => {
    const future = new Date(Date.now() + MATCHES_CACHE_TTL_MS)
    expect(isMatchesCacheValid(future)).toBe(true)
  })

  it('isMatchesCacheValid — 만료됐으면 무효', () => {
    const past = new Date(Date.now() - 1)
    expect(isMatchesCacheValid(past)).toBe(false)
  })

  it('readMatchesCacheSnapshot — 만료된 캐시도 season aggregate seed로 읽음', async () => {
    const row = {
      data: [
        {
          matchId: '1',
          userNum: 123,
          characterNum: 19,
          characterName: '엠마',
          placement: 1,
          kills: 4,
          deaths: 1,
          assists: 3,
          gameStartedAt: '2026-06-10T00:00:00.000Z',
          victory: true,
        },
      ],
      next: 1234,
      expiresAt: new Date(Date.now() - 1),
    }
    const prisma = {
      matchesCache: {
        findUnique: async () => row,
      },
    } as unknown as PrismaClient

    await expect(readMatchesCache(prisma, 'uid:0')).resolves.toBeNull()
    await expect(readMatchesCacheSnapshot(prisma, 'uid:0')).resolves.toEqual({
      items: row.data,
      next: 1234,
    })
  })
})
