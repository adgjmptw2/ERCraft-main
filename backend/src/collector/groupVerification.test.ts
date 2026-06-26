import { describe, expect, it, vi } from 'vitest'

import type { BserUserGame } from '../external/bserClient.js'
import { loadCollectorConfig } from './config.js'
import {
  matchesVerificationTarget,
  verifyGroupWithTieredPages,
} from './groupVerification.js'

function game(overrides: Partial<BserUserGame> = {}): BserUserGame {
  return {
    gameId: 10001,
    nickname: 'TestPlayer',
    characterNum: 1,
    teamNumber: 2,
    seasonId: 11,
    matchingMode: 3,
    startDtm: '2026-01-01T00:00:00Z',
    gameRank: 1,
    ...overrides,
  } as BserUserGame
}

describe('verifyGroupWithTieredPages', () => {
  const config = loadCollectorConfig({
    identityQuickPages: 1,
    identityNormalPages: 3,
    identityDeepPages: 20,
    identityDeepEnabled: true,
    identityDeepPriorityThreshold: 80,
  })

  it('resolves multiple candidates from a single page', async () => {
    const fetchPage = vi.fn(async () => ({
      games: [
        game({ gameId: 10001 }),
        game({ gameId: 10002, characterNum: 3, teamNumber: 4 }),
      ],
      next: 99,
    }))

    const result = await verifyGroupWithTieredPages(config, {
      priority: 20,
      candidates: [
        {
          candidateId: 'a',
          sourcePlayedAtMs: Date.parse('2026-01-01T00:00:00Z'),
          target: {
            sourceGameId: '10001',
            nickname: 'TestPlayer',
            teamNumber: 2,
            characterNum: 1,
            seasonId: 11,
            matchingMode: 3,
            sourcePlayedAtMs: Date.parse('2026-01-01T00:00:00Z'),
          },
        },
        {
          candidateId: 'b',
          sourcePlayedAtMs: Date.parse('2026-01-02T00:00:00Z'),
          target: {
            sourceGameId: '10002',
            nickname: 'TestPlayer',
            teamNumber: 4,
            characterNum: 3,
            seasonId: 11,
            matchingMode: 3,
            sourcePlayedAtMs: Date.parse('2026-01-02T00:00:00Z'),
          },
        },
      ],
      fetchPage,
    })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result.outcomes.get('a')).toBe('resolved')
    expect(result.outcomes.get('b')).toBe('resolved')
    expect(result.stoppedReason).toBe('found')
  })

  it('stops early when all candidates are resolved', async () => {
    const fetchPage = vi.fn(async () => ({
      games: [game({ gameId: 10001 })],
      next: 42,
    }))

    const result = await verifyGroupWithTieredPages(config, {
      priority: 20,
      candidates: [
        {
          candidateId: 'a',
          sourcePlayedAtMs: Date.parse('2026-01-01T00:00:00Z'),
          target: {
            sourceGameId: '10001',
            nickname: 'TestPlayer',
            teamNumber: 2,
            characterNum: 1,
            seasonId: 11,
            matchingMode: 3,
            sourcePlayedAtMs: Date.parse('2026-01-01T00:00:00Z'),
          },
        },
      ],
      fetchPage,
    })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result.outcomes.get('a')).toBe('resolved')
  })

  it('classifies mismatch when game id is absent', async () => {
    const fetchPage = vi.fn(async () => ({
      games: [game({ gameId: 99999 })],
      next: undefined,
    }))

    const result = await verifyGroupWithTieredPages(config, {
      priority: 20,
      candidates: [
        {
          candidateId: 'a',
          sourcePlayedAtMs: Date.parse('2026-01-01T00:00:00Z'),
          target: {
            sourceGameId: '10001',
            nickname: 'TestPlayer',
            teamNumber: 2,
            characterNum: 1,
            seasonId: 11,
            matchingMode: 3,
            sourcePlayedAtMs: Date.parse('2026-01-01T00:00:00Z'),
          },
        },
      ],
      fetchPage,
    })

    expect(result.outcomes.get('a')).toBe('unresolved-game-mismatch')
  })
})

describe('matchesVerificationTarget', () => {
  it('rejects explicit season mismatch', () => {
    const target = {
      sourceGameId: '10001',
      nickname: 'TestPlayer',
      teamNumber: 2,
      characterNum: 1,
      seasonId: 11,
      matchingMode: 3,
      sourcePlayedAtMs: null,
    }
    expect(matchesVerificationTarget(game({ seasonId: 12 }), target)).toBe(false)
    expect(matchesVerificationTarget(game({ seasonId: 11 }), target)).toBe(true)
  })
})
