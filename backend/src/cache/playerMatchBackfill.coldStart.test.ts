import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

import {
  clearFullBackfillStateForTests,
  effectiveBackfillCollectedGames,
  getLastBackfillWorkerTrace,
  isSeasonDataCollectionComplete,
  runSeasonBackfillWorker,
  shouldEnqueueSeasonBackfill,
  snapshotFullBackfillProgress,
} from './playerMatchBackfill.js'
import * as playerMatchStore from './playerMatchStore.js'
import * as playerSeasonBackfillState from './playerSeasonBackfillState.js'
import type { PlayerSeasonBackfillStateRow } from './playerSeasonBackfillState.js'

function completeDbState(overrides: Partial<PlayerSeasonBackfillStateRow> = {}): PlayerSeasonBackfillStateRow {
  return {
    id: 'uid-cold:39',
    uid: 'uid-cold',
    apiSeasonId: 39,
    displaySeasonId: 11,
    status: 'complete',
    officialSeasonGames: 784,
    collectedGames: 784,
    nextCursor: 120,
    lastCursor: 110,
    lastStoppedReason: 'complete',
    lastError: null,
    pagesFetchedTotal: 80,
    rawGamesSeenTotal: 800,
    rankGamesSeenTotal: 784,
    upsertedTotal: 784,
    duplicateTotal: 0,
    startedAt: null,
    lastRunAt: new Date('2026-06-01T00:00:00Z'),
    finishedAt: new Date('2026-06-01T00:00:00Z'),
    retryAfter: null,
    ...overrides,
  }
}

function makeBserGame(gameId: number) {
  return {
    gameId,
    seasonId: 39,
    matchingMode: 3,
    matchingTeamMode: 3,
    characterNum: 1,
    gameRank: 1,
    playerKill: 1,
    playerDeaths: 0,
    playerAssistant: 0,
    victory: 1,
    startDtm: '2026-06-18T00:00:00Z',
    playTime: 1200,
    rpAfter: 6200,
  }
}

describe('cold start idempotency — DB complete 우선', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    clearFullBackfillStateForTests()
  })

  it('in-memory 비어 있어도 complete DB면 shouldEnqueueSeasonBackfill=false', async () => {
    const prisma = {
      playerSeasonBackfillState: {
        findUnique: async () => completeDbState(),
      },
    }
    const result = await shouldEnqueueSeasonBackfill(
      prisma as never,
      'uid-cold',
      39,
      784,
      784,
    )
    expect(result).toBe(false)
  })

  it('complete DB + rankCount=0이어도 shouldEnqueueSeasonBackfill=false', async () => {
    const prisma = {
      playerSeasonBackfillState: {
        findUnique: async () => completeDbState({ collectedGames: 784 }),
      },
    }
    const result = await shouldEnqueueSeasonBackfill(
      prisma as never,
      'uid-cold',
      39,
      784,
      0,
    )
    expect(result).toBe(false)
  })

  it('complete DB + rankCount=0이면 worker는 latest-refresh만 수행', async () => {
    vi.spyOn(playerMatchStore, 'isPrismaPlayerMatchReady').mockReturnValue(true)
    vi.spyOn(playerMatchStore, 'countPlayerMatchRankGamesForSeason').mockResolvedValue(0)
    vi.spyOn(playerMatchStore, 'hasPlayerMatch').mockResolvedValue(true)
    vi.spyOn(playerMatchStore, 'upsertFreshPlayerMatches').mockResolvedValue({
      upserted: 0,
      skipped: 0,
      failed: false,
    })
    vi.spyOn(playerSeasonBackfillState, 'readPlayerSeasonBackfillState').mockResolvedValue(
      completeDbState(),
    )
    const writeSpy = vi
      .spyOn(playerSeasonBackfillState, 'writePlayerSeasonBackfillState')
      .mockResolvedValue(undefined)

    const getUserGames = vi.fn(async () => ({
      games: [makeBserGame(784), makeBserGame(783)] as never[],
      next: undefined,
    }))

    await runSeasonBackfillWorker({
      prisma: {} as PrismaClient,
      deps: { getUserGames },
      uid: 'uid-cold',
      apiSeasonId: 39,
      displaySeasonId: 11,
      officialSeasonGames: 784,
      dedupe: false,
    })

    expect(getLastBackfillWorkerTrace()?.action).toBe('latest-refresh')
    expect(getUserGames.mock.calls.length).toBeLessThanOrEqual(2)
    expect(writeSpy.mock.calls.some((call) => call[1]?.status === 'running')).toBe(false)
  })

  it('partial DB + rankCount=0이면 collectedGames 기준 progress 유지', () => {
    const snapshot = snapshotFullBackfillProgress({
      uid: 'uid-partial',
      apiSeasonId: 39,
      rankCount: 0,
      officialSeasonGames: 784,
      dbState: {
        ...completeDbState({ status: 'partial', collectedGames: 500, lastStoppedReason: 'chunk-limit' }),
      },
    })
    expect(snapshot.status).toBe('partial')
    expect(snapshot.collectedGames).toBe(500)
  })

  it('isSeasonDataCollectionComplete는 DB collectedGames 하한을 사용', () => {
    expect(
      isSeasonDataCollectionComplete({
        dbState: completeDbState({ collectedGames: 784 }),
        rankCount: 0,
        officialSeasonGames: 784,
      }),
    ).toBe(true)
    expect(effectiveBackfillCollectedGames(0, completeDbState())).toBe(784)
  })

  it('canonical userNum이 같으면 다른 nickname이어도 같은 uid key로 complete 판정', async () => {
    const prisma = {
      playerSeasonBackfillState: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (where.id === 'canonical-uid:39') return completeDbState({ uid: 'canonical-uid' })
          return null
        },
      },
    }
    const result = await shouldEnqueueSeasonBackfill(
      prisma as never,
      'canonical-uid',
      39,
      784,
      784,
    )
    expect(result).toBe(false)
  })
})
