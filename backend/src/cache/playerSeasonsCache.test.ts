import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { vi } from 'vitest'

import {
  isLikelyStalePlayerSeasonsChunk,
  playerSeasonsCacheExpiresAt,
  playerSeasonsCacheId,
  writePlayerSeasonsCache,
} from './playerSeasonsCache.js'
import { CURRENT_SEASON_STATS_TTL_MS } from './seasonStatsCache.js'

describe('playerSeasonsCache', () => {
  it('playerSeasonsCacheId — uid:from:to', () => {
    expect(playerSeasonsCacheId('uid', 1, 11)).toBe('uid:1:11')
  })

  it('현재 시즌이 범위에 있으면 1시간 TTL', () => {
    const expires = playerSeasonsCacheExpiresAt(1, 11, 11, 1_000_000)
    expect(expires?.getTime()).toBe(1_000_000 + CURRENT_SEASON_STATS_TTL_MS)
  })

  it('과거 시즌만 있으면 영구 캐시', () => {
    expect(playerSeasonsCacheExpiresAt(1, 10, 11)).toBeNull()
  })

  it('동시 upsert 충돌이면 update로 캐시 쓰기를 마무리', async () => {
    const upsert = vi.fn().mockRejectedValue({ code: 'P2002' })
    const update = vi.fn().mockResolvedValue({})
    const prisma = {
      playerSeasonsCache: {
        findUnique: vi.fn(),
        upsert,
        update,
      },
    } as unknown as PrismaClient

    await writePlayerSeasonsCache(
      prisma,
      playerSeasonsCacheId('uid', 1, 11),
      { currentSeason: 11, seasons: [] },
      1,
      11,
      11,
    )

    expect(upsert).toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'uid:1:11' },
    }))
  })

  it('isLikelyStalePlayerSeasonsChunk — S1만 있고 S2 빈 청크면 stale', () => {
    const cached = {
      currentSeason: 11,
      seasons: [
        {
          seasonNumber: 1,
          rank: { tier: '미스릴', rp: 6060 },
          tier: '미스릴',
          wins: 500,
          losses: 500,
          games: 1540,
          avgPlacement: 4,
          kda: 2,
          top3Rate: 30,
          winRate: 30,
          played: true,
        },
        {
          seasonNumber: 2,
          rank: { tier: '—', rp: 0 },
          tier: '—',
          wins: 0,
          losses: 0,
          games: 0,
          avgPlacement: 0,
          kda: 0,
          top3Rate: 0,
          winRate: 0,
          played: false,
        },
      ],
    }
    expect(isLikelyStalePlayerSeasonsChunk(cached, 1, 2)).toBe(true)
  })

  it('isLikelyStalePlayerSeasonsChunk — 연속 미플레이면 stale 아님', () => {
    const cached = {
      currentSeason: 11,
      seasons: [
        {
          seasonNumber: 1,
          rank: { tier: '—', rp: 0 },
          tier: '—',
          wins: 0,
          losses: 0,
          games: 0,
          avgPlacement: 0,
          kda: 0,
          top3Rate: 0,
          winRate: 0,
          played: false,
        },
        {
          seasonNumber: 2,
          rank: { tier: '—', rp: 0 },
          tier: '—',
          wins: 0,
          losses: 0,
          games: 0,
          avgPlacement: 0,
          kda: 0,
          top3Rate: 0,
          winRate: 0,
          played: false,
        },
      ],
    }
    expect(isLikelyStalePlayerSeasonsChunk(cached, 1, 2)).toBe(false)
  })
})
