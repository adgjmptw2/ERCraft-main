import { describe, expect, it, vi } from 'vitest'

import { loadCollectorConfig } from './config.js'
import { verifyIdentityWithTieredPages } from './identityVerification.js'
import type { BserUserGame } from '../external/bserClient.js'

function game(gameId: number, startDtm: string): BserUserGame {
  return {
    gameId,
    nickname: 'TestPlayer',
    characterNum: 1,
    teamNumber: 2,
    seasonId: 11,
    matchingMode: 3,
    startDtm,
    gameRank: 1,
  } as BserUserGame
}

describe('verifyIdentityWithTieredPages', () => {
  const config = loadCollectorConfig({ workerId: 'verify-test' })

  it('quick 1페이지에서 sourceGameId를 찾으면 즉시 종료한다', async () => {
    let calls = 0
    const result = await verifyIdentityWithTieredPages(config, {
      priority: 90,
      target: {
        sourceGameId: '10001',
        nickname: 'TestPlayer',
        teamNumber: 2,
        characterNum: 1,
        seasonId: 11,
        matchingMode: 3,
        sourcePlayedAtMs: Date.parse('2026-06-01T12:00:00Z'),
      },
      fetchPage: async () => {
        calls += 1
        return { games: [game(10001, '2026-06-01T12:00:00Z')] }
      },
    })
    expect(result.found).toBe(true)
    expect(result.resolvedTier).toBe('quick')
    expect(calls).toBe(1)
  })

  it('sourceGameId 발견 전 past-window면 out-of-window로 분류한다', async () => {
    const result = await verifyIdentityWithTieredPages(config, {
      priority: 95,
      target: {
        sourceGameId: '10001',
        nickname: 'TestPlayer',
        teamNumber: 2,
        characterNum: 1,
        seasonId: 11,
        matchingMode: 3,
        sourcePlayedAtMs: Date.parse('2026-06-01T12:00:00Z'),
      },
      fetchPage: async () => ({
        games: [game(20002, '2026-01-01T12:00:00Z')],
        next: undefined,
      }),
    })
    expect(result.found).toBe(false)
    expect(result.resolvedTier).toBe('out-of-window')
  })

  it('빈 페이지면 조기 종료한다', async () => {
    const result = await verifyIdentityWithTieredPages(config, {
      priority: 50,
      target: {
        sourceGameId: '10001',
        nickname: 'TestPlayer',
        teamNumber: 2,
        characterNum: 1,
        seasonId: 11,
        matchingMode: 3,
        sourcePlayedAtMs: null,
      },
      fetchPage: async () => ({ games: [] }),
    })
    expect(result.found).toBe(false)
    expect(result.stoppedReason).toBe('empty-page')
  })

  it('중복 페이지 커서면 조기 종료한다', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ games: [game(20002, '2026-05-01T12:00:00Z')], next: 2 })
      .mockResolvedValueOnce({ games: [game(20003, '2026-04-01T12:00:00Z')], next: 2 })
    const result = await verifyIdentityWithTieredPages(config, {
      priority: 50,
      target: {
        sourceGameId: '10001',
        nickname: 'TestPlayer',
        teamNumber: 2,
        characterNum: 1,
        seasonId: 11,
        matchingMode: 3,
        sourcePlayedAtMs: null,
      },
      fetchPage,
    })
    expect(result.found).toBe(false)
    expect(result.stoppedReason).toBe('duplicate-page')
  })
})
