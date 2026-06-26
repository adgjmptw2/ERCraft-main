/**
 * 39.10Y — frontend profile ownership diagnostic contracts.
 */
import { describe, expect, it } from 'vitest'

import { gateSeasonsPayload, gateStatsPayloadWithResult } from '@/utils/profileOwnerGate'
import type { PlayerStatsDTO } from '@/types/player'
import type { PlayerSeasonsResponse } from '@/types/season'

function statsDto(userNum: number): PlayerStatsDTO {
  return {
    userNum,
    games: 10,
    winRate: 50,
    avgKills: 2,
    avgPlacement: 4,
    kda: 3,
    kdaString: '3.00',
    mostPlayedCharacter: { name: '엠마', count: 5 },
    tier: 'DIAMOND',
    mmr: 5000,
    playerMatchCharacterStatsMeta: {
      status: 'complete',
      userNum,
      seasonId: 11,
      generatedAt: '2026-01-01T00:00:00.000Z',
      rowCount: 0,
      matchCount: 0,
    },
  }
}

describe('profile ownership — frontend contracts', () => {
  it('seasons owner aligned with summary canonical passes gate', () => {
    const summaryCanonical = 239272700
    const payload: PlayerSeasonsResponse = {
      currentSeason: 11,
      seasons: [{
        seasonNumber: 11,
        tier: '메테오라이트',
        rank: { tier: '메테오라이트', division: 3, rp: 6991 },
        wins: 50,
        losses: 50,
        avgPlacement: 4,
        kda: 3,
        top3Rate: 50,
        played: true,
      }],
      owner: { nickname: '연서', userNum: summaryCanonical },
      source: { count: 2, strategy: 'verified-alias' },
      requestedRange: { from: 1, to: 11 },
    }

    expect(gateSeasonsPayload(payload, '연서', summaryCanonical, 1, 11)?.owner?.userNum).toBe(
      summaryCanonical,
    )
  })

  it('seasons owner mismatch with summary canonical still blocks handoff', () => {
    const summaryCanonical = 239272700
    const seasonsFromResolveUser = 1727837593
    const payload: PlayerSeasonsResponse = {
      currentSeason: 11,
      seasons: [],
      owner: { nickname: '연서', userNum: seasonsFromResolveUser },
      requestedRange: { from: 1, to: 11 },
    }

    expect(gateSeasonsPayload(payload, '연서', summaryCanonical, 1, 11)).toBeUndefined()
  })

  it('stats owner accepted but pm rowCount 0 — gate passes, rich UI depends on meta rowCount', () => {
    const owner = 1464399340
    const result = gateStatsPayloadWithResult(statsDto(owner), owner)
    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect(result.data.playerMatchCharacterStatsMeta?.rowCount).toBe(0)
    }
  })

  it('summary level null with accepted stats owner — DTO has no level field', () => {
    const owner = 1464399340
    const result = gateStatsPayloadWithResult(statsDto(owner), owner)
    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect('level' in result.data).toBe(false)
    }
  })
})
