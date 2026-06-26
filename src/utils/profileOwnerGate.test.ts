import { describe, expect, it } from 'vitest'

import {
  evaluateStatsIdentityMatch,
  gateMatchItemsByOwner,
  gateSeasonsPayload,
  gateStatsPayload,
  gateStatsPayloadWithResult,
  resolveStatsPayloadUserNum,
  isStatsIdentityMatched,
} from '@/utils/profileOwnerGate'
import type { PlayerStatsDTO } from '@/types/player'
import type { PlayerSeasonsResponse } from '@/types/season'

function statsFor(
  userNum: number,
  metaUserNum?: number,
): PlayerStatsDTO {
  return {
    games: 10,
    winRate: 20,
    avgKills: 2,
    avgPlacement: 4,
    kda: 3,
    kdaString: '3.00',
    mostPlayedCharacter: { name: '엠마', count: 10 },
    tier: 'DIAMOND',
    mmr: 5000,
    userNum,
    playerMatchCharacterStatsMeta:
      metaUserNum != null
        ? {
            status: 'complete',
            userNum: metaUserNum,
            seasonId: 11,
            generatedAt: '2026-01-01T00:00:00.000Z',
            rowCount: 2,
            matchCount: 10,
          }
        : undefined,
    playerMatchCharacterStats: [
      {
        characterNum: 1,
        characterName: '엠마',
        games: 10,
        wins: 4,
        winRate: 40,
        avgRank: 3,
        kills: 20,
        assists: 10,
        deaths: 8,
        kda: 3.75,
        avgTeamKills: 8,
        avgKills: 2,
        avgDamage: 12000,
        gradeLabel: 'A',
      },
    ],
  }
}

describe('profileOwnerGate', () => {
  it('expected userNum이 있고 incoming이 null이면 unverified', () => {
    expect(evaluateStatsIdentityMatch(222, null)).toBe('unverified')
    expect(isStatsIdentityMatched(evaluateStatsIdentityMatch(222, null))).toBe(false)
  })

  it('expected userNum이 없으면 pending', () => {
    expect(evaluateStatsIdentityMatch(0, 111)).toBe('pending')
    expect(statsIdentityMatchesPending()).toBe(false)
  })

  it('gateStatsPayload는 owner mismatch를 reject한다', () => {
    expect(gateStatsPayload(statsFor(111), 222)).toBeNull()
    expect(gateStatsPayload(statsFor(222), 222)?.userNum).toBe(222)
  })

  it('meta userNum만 있어도 owner를 resolve한다', () => {
    const stats: PlayerStatsDTO = {
      ...statsFor(0, 100),
      userNum: undefined,
    }
    expect(resolveStatsPayloadUserNum(stats)).toBe(100)
    expect(gateStatsPayloadWithResult(stats, 100)).toEqual({
      status: 'accepted',
      data: stats,
      ownerUserNum: 100,
    })
  })

  it('top-level과 meta owner가 다르면 contract-conflict', () => {
    const result = gateStatsPayloadWithResult(statsFor(100, 200), 100)
    expect(result).toEqual({ status: 'rejected', reason: 'contract-conflict' })
    expect(resolveStatsPayloadUserNum(statsFor(100, 200))).toBeNull()
  })

  it('summary pending이면 stats를 accept하지 않는다', () => {
    expect(gateStatsPayloadWithResult(statsFor(100), null)).toEqual({
      status: 'pending',
      reason: 'summary-pending',
    })
  })

  it('owner null이면 unverified pending', () => {
    const stats: PlayerStatsDTO = {
      ...statsFor(0),
      userNum: undefined,
      playerMatchCharacterStatsMeta: undefined,
    }
    expect(gateStatsPayloadWithResult(stats, 100)).toEqual({
      status: 'pending',
      reason: 'owner-unverified',
    })
  })

  it('gateSeasonsPayload는 owner/range mismatch를 reject한다', () => {
    const payload: PlayerSeasonsResponse = {
      currentSeason: 11,
      seasons: [],
      owner: { nickname: 'alice', userNum: 1 },
      requestedRange: { from: 11, to: 11 },
    }
    expect(gateSeasonsPayload(payload, 'bob', 2, 11, 11)).toBeUndefined()
    expect(gateSeasonsPayload(payload, 'alice', 1, 11, 11)?.owner?.userNum).toBe(1)
  })

  it('gateMatchItemsByOwner는 owner 미확정 시 빈 배열', () => {
    const items = [{ userNum: 100, matchId: '1' }]
    expect(gateMatchItemsByOwner(items, null)).toEqual([])
  })
})

function statsIdentityMatchesPending(): boolean {
  return isStatsIdentityMatched(evaluateStatsIdentityMatch(0, 111))
}
