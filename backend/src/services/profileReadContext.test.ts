import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

vi.mock('../cache/seasonStatsCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/seasonStatsCache.js')>()
  return {
    ...actual,
    readSeasonStatsCacheSnapshot: vi.fn(async (_prisma, id: string) => {
      if (id === 'alias-uid:39') {
        return [{ nickname: '하잉', matchingTeamMode: 3, totalGames: 6, mmr: 5077 }]
      }
      return null
    }),
  }
})

vi.mock('../cache/playerSeasonsCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/playerSeasonsCache.js')>()
  return {
    ...actual,
    readPlayerSeasonsCache: vi.fn(),
    shouldRefetchPlayerSeasonsChunk: vi.fn(async () => false),
  }
})

import { readPlayerSeasonsCache } from '../cache/playerSeasonsCache.js'
import {
  resolveDbStatsFingerprint,
  squadStatsFingerprint,
  tryReadSeasonsGridFromDb,
} from './profileReadContext.js'

const mockSeasonCatalog = {
  apiIdForDisplay: (displaySeason: number) => (displaySeason === 11 ? 39 : displaySeason + 9),
} as const

describe('profileReadContext', () => {
  it('squadStatsFingerprint — squad row에서 fingerprint 추출', () => {
    expect(
      squadStatsFingerprint([
        { matchingTeamMode: 3, totalGames: 6, mmr: 5077 } as never,
      ]),
    ).toEqual({ totalGames: 6, mmr: 5077 })
  })

  it('resolveDbStatsFingerprint — lookup miss 시 nickname-linked uid에서 복원', async () => {
    const prisma = {
      matchParticipant: { findMany: vi.fn(async () => []) },
      seasonStatsCache: {
        findMany: vi.fn(async () => [
          {
            id: 'alias-uid:39',
            data: [{ nickname: '하잉', matchingTeamMode: 3, totalGames: 6, mmr: 5077 }],
          },
        ]),
      },
    } as unknown as PrismaClient

    await expect(
      resolveDbStatsFingerprint(prisma, '하잉', 'lookup-uid', 39),
    ).resolves.toEqual({ totalGames: 6, mmr: 5077 })
  })

  it('tryReadSeasonsGridFromDb — DB hit 시 upstream 없이 반환', async () => {
    vi.mocked(readPlayerSeasonsCache).mockResolvedValueOnce({
      currentSeason: 11,
      seasons: [{ seasonNumber: 11, played: true } as never],
    })

    const result = await tryReadSeasonsGridFromDb(
      {} as PrismaClient,
      ['canon-uid'],
      1,
      11,
      mockSeasonCatalog as never,
    )
    expect(result?.uid).toBe('canon-uid')
    expect(result?.body.seasons).toHaveLength(1)
  })
})
