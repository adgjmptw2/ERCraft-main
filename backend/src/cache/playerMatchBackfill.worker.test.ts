import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

import {
  BACKFILL_CHUNK_MAX_PAGES,
  bootstrapBackfillStateIfMissing,
  clearFullBackfillStateForTests,
  continueSeasonBackfillChunk,
  getLastBackfillWorkerTrace,
  isStaleRunningState,
  LATEST_REFRESH_MAX_PAGES,
  refreshLatestRankMatchesForPlayer,
  runSeasonBackfillWorker,
  scheduleInternalBackfillChunk,
  shouldChainNextBackfillChunk,
  snapshotFullBackfillProgress,
  STALE_RUNNING_MS,
} from './playerMatchBackfill.js'
import * as playerMatchStore from './playerMatchStore.js'
import * as playerSeasonBackfillState from './playerSeasonBackfillState.js'
import { backfillStateId } from './playerSeasonBackfillState.js'

function makeBserGame(gameId: number) {
  return {
    gameId,
    seasonId: 20,
    matchingMode: 3,
    matchingTeamMode: 3,
    characterNum: 1,
    gameRank: 1,
    playerKill: 1,
    playerDeaths: 0,
    playerAssistant: 0,
    victory: 1,
    startDtm: '2026-06-01T00:00:00Z',
    playTime: 1200,
    rpAfter: 6200,
  }
}

describe('bootstrapBackfillStateIfMissing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('state 없음 + rankCount >= official이면 complete bootstrap', async () => {
    const writeSpy = vi
      .spyOn(playerSeasonBackfillState, 'writePlayerSeasonBackfillState')
      .mockResolvedValue(undefined)
    vi.spyOn(playerSeasonBackfillState, 'readPlayerSeasonBackfillState').mockResolvedValue(null)

    const result = await bootstrapBackfillStateIfMissing({
      prisma: {} as PrismaClient,
      uid: 'uid-bootstrap',
      apiSeasonId: 39,
      displaySeasonId: 11,
      officialSeasonGames: 48,
      rankCount: 48,
    })

    expect(result.action).toBe('bootstrap-complete')
    expect(writeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'complete', collectedGames: 48 }),
    )
  })

  it('state 없음 + rankCount > 0이면 partial bootstrap', async () => {
    const writeSpy = vi
      .spyOn(playerSeasonBackfillState, 'writePlayerSeasonBackfillState')
      .mockResolvedValue(undefined)
    vi.spyOn(playerSeasonBackfillState, 'readPlayerSeasonBackfillState').mockResolvedValue(null)

    const result = await bootstrapBackfillStateIfMissing({
      prisma: {} as PrismaClient,
      uid: 'uid-partial',
      apiSeasonId: 39,
      displaySeasonId: 11,
      officialSeasonGames: 797,
      rankCount: 10,
    })

    expect(result.action).toBe('bootstrap-partial')
    expect(writeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'partial', collectedGames: 10 }),
    )
  })
})

describe('isStaleRunningState', () => {
  it('running + lastRunAt 오래됨 → stale', () => {
    expect(
      isStaleRunningState({
        id: 'u:39',
        uid: 'u',
        apiSeasonId: 39,
        displaySeasonId: 11,
        status: 'running',
        officialSeasonGames: 100,
        collectedGames: 10,
        nextCursor: null,
        lastCursor: null,
        lastStoppedReason: null,
        lastError: null,
        pagesFetchedTotal: 0,
        rawGamesSeenTotal: 0,
        rankGamesSeenTotal: 0,
        upsertedTotal: 0,
        duplicateTotal: 0,
        startedAt: null,
        lastRunAt: new Date(Date.now() - STALE_RUNNING_MS - 1_000),
        finishedAt: null,
        retryAfter: null,
      }),
    ).toBe(true)
  })
})

describe('runSeasonBackfillWorker state before fetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    clearFullBackfillStateForTests()
  })

  it('worker 시작 시 running row를 fetch 전에 기록한다', async () => {
    vi.spyOn(playerMatchStore, 'isPrismaPlayerMatchReady').mockReturnValue(true)
    vi.spyOn(playerMatchStore, 'countPlayerMatchRankGamesForSeason').mockResolvedValue(10)
    vi.spyOn(playerMatchStore, 'hasPlayerMatch').mockResolvedValue(false)
    vi.spyOn(playerMatchStore, 'upsertFreshPlayerMatches').mockResolvedValue({
      upserted: 10,
      skipped: 0,
      failed: false,
    })
    vi.spyOn(playerSeasonBackfillState, 'readPlayerSeasonBackfillState').mockResolvedValue(null)
    const writeSpy = vi
      .spyOn(playerSeasonBackfillState, 'writePlayerSeasonBackfillState')
      .mockResolvedValue(undefined)

    const getUserGames = vi.fn(async () => ({
      games: Array.from({ length: 10 }, (_, i) => makeBserGame(i + 1)) as never[],
      next: undefined,
    }))

    await runSeasonBackfillWorker({
      prisma: {} as PrismaClient,
      deps: { getUserGames },
      uid: 'uid-worker',
      apiSeasonId: 39,
      displaySeasonId: 11,
      officialSeasonGames: 797,
      dedupe: false,
    })

    expect(writeSpy).toHaveBeenCalled()
    const runningCall = writeSpy.mock.calls.find((call) => call[1]?.status === 'running')
    expect(runningCall).toBeDefined()
    expect(getUserGames).toHaveBeenCalled()
    expect(getLastBackfillWorkerTrace()?.stateCreatedBeforeFetch).toBe(true)
  })

  it('scheduleInternalBackfillChunk는 chunk 연쇄를 예약한다', async () => {
    vi.useFakeTimers()
    const chainRuns: number[] = []
    scheduleInternalBackfillChunk(
      {
        prisma: {} as PrismaClient,
        deps: { getUserGames: vi.fn() },
        uid: 'uid-sched',
        apiSeasonId: 39,
        displaySeasonId: 11,
        officialSeasonGames: 797,
        dedupe: false,
      },
      async (_p, depth) => {
        chainRuns.push(depth)
      },
      2,
    )
    await vi.runAllTimersAsync()
    expect(chainRuns).toEqual([2])
    vi.useRealTimers()
  })
})

describe('shouldChainNextBackfillChunk', () => {
  it('chunk-limit이고 collected < official이면 true', () => {
    expect(
      shouldChainNextBackfillChunk(
        {
          rankCountBefore: 10,
          rankCountAfter: 20,
          pagesFetched: BACKFILL_CHUNK_MAX_PAGES,
          matchesUpserted: 10,
          stoppedReason: 'chunk-limit',
          durationMs: 1,
          diagnostics: {
            officialSeasonGames: 100,
            rankCountBefore: 10,
            rankCountAfter: 20,
            pagesFetched: BACKFILL_CHUNK_MAX_PAGES,
            rawGamesSeen: 50,
            rankGamesSeen: 50,
            upsertedCount: 10,
            duplicateCount: 0,
            nonRankCount: 0,
            outOfSeasonCount: 0,
            stoppedReason: 'chunk-limit',
          },
        },
        100,
      ),
    ).toBe(true)
  })

  it('complete 상태에서는 full backfill을 재시작하지 않는다', () => {
    expect(
      shouldChainNextBackfillChunk(
        {
          rankCountBefore: 48,
          rankCountAfter: 48,
          pagesFetched: 0,
          matchesUpserted: 0,
          stoppedReason: 'complete',
          durationMs: 1,
          diagnostics: {
            officialSeasonGames: 48,
            rankCountBefore: 48,
            rankCountAfter: 48,
            pagesFetched: 0,
            rawGamesSeen: 0,
            rankGamesSeen: 0,
            upsertedCount: 0,
            duplicateCount: 0,
            nonRankCount: 0,
            outOfSeasonCount: 0,
            stoppedReason: 'complete',
          },
        },
        48,
      ),
    ).toBe(false)
  })
})

describe('continueSeasonBackfillChunk', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    clearFullBackfillStateForTests()
  })

  it('chunk worker는 한 번에 지정 page 수 이상 fetch하지 않는다', async () => {
    vi.spyOn(playerMatchStore, 'isPrismaPlayerMatchReady').mockReturnValue(true)
    let rankCount = 0
    vi.spyOn(playerMatchStore, 'countPlayerMatchRankGamesForSeason').mockImplementation(async () => rankCount)
    vi.spyOn(playerMatchStore, 'hasPlayerMatch').mockResolvedValue(false)
    vi.spyOn(playerMatchStore, 'upsertFreshPlayerMatches').mockImplementation(async (_prisma, _uid, fresh) => {
      rankCount += fresh.length
      return { upserted: fresh.length, skipped: 0, failed: false }
    })

    const getUserGames = vi.fn(async (_uid: string, cursor?: number) => {
      const start = cursor ?? 0
      if (start >= 200) return { games: [], next: undefined }
      return {
        games: Array.from({ length: 10 }, (_, i) => makeBserGame(start + i + 1)) as never[],
        next: start + 10,
      }
    })

    const result = await continueSeasonBackfillChunk({
      prisma: {} as PrismaClient,
      deps: { getUserGames },
      uid: 'uid-chunk',
      apiSeasonId: 20,
      displaySeasonId: 11,
      officialSeasonGames: 200,
      dedupe: false,
    })

    expect(result.pagesFetched).toBeLessThanOrEqual(BACKFILL_CHUNK_MAX_PAGES)
    expect(result.stoppedReason).toBe('chunk-limit')
  })
})

describe('refreshLatestRankMatchesForPlayer (complete +@)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    clearFullBackfillStateForTests()
  })

  it('complete 상태에서 새 gameId 3개만 upsert하고 기존 gameId에서 stop', async () => {
    vi.spyOn(playerMatchStore, 'isPrismaPlayerMatchReady').mockReturnValue(true)
    const existing = new Set(Array.from({ length: 100 }, (_, i) => String(i + 1)))
    let rankCount = existing.size
    vi.spyOn(playerMatchStore, 'countPlayerMatchRankGamesForSeason').mockImplementation(async () => rankCount)
    vi.spyOn(playerMatchStore, 'hasPlayerMatch').mockImplementation(async (_prisma, _uid, gameId) =>
      existing.has(gameId),
    )
    const upsertSpy = vi.spyOn(playerMatchStore, 'upsertFreshPlayerMatches').mockImplementation(
      async (_prisma, _uid, fresh) => {
        let upserted = 0
        for (const row of fresh) {
          if (!existing.has(row.match.matchId)) {
            existing.add(row.match.matchId)
            upserted += 1
          }
        }
        rankCount = existing.size
        return { upserted, skipped: 0, failed: false }
      },
    )

    const getUserGames = vi.fn(async () => ({
      games: [
        makeBserGame(103),
        makeBserGame(102),
        makeBserGame(101),
        makeBserGame(100),
      ] as never[],
      next: 10,
    }))

    const result = await refreshLatestRankMatchesForPlayer({
      prisma: {} as PrismaClient,
      deps: { getUserGames },
      uid: 'uid-latest',
      apiSeasonId: 20,
      displaySeasonId: 11,
      officialSeasonGames: 103,
      dedupe: false,
    })

    expect(result.pagesFetched).toBeGreaterThan(0)
    expect(result.pagesFetched).toBeLessThanOrEqual(LATEST_REFRESH_MAX_PAGES)
    expect(result.matchesUpserted).toBe(3)
    expect(result.rankCountAfter).toBe(103)
    expect(result.stoppedReason).toBe('complete')
    expect(getUserGames).toHaveBeenCalledTimes(1)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    expect(shouldChainNextBackfillChunk(result, 100)).toBe(false)
  })

  it('upsert 0이면 aggregate rebuild 대상이 아님 (matchesUpserted=0)', async () => {
    vi.spyOn(playerMatchStore, 'isPrismaPlayerMatchReady').mockReturnValue(true)
    vi.spyOn(playerMatchStore, 'countPlayerMatchRankGamesForSeason').mockResolvedValue(100)
    vi.spyOn(playerMatchStore, 'hasPlayerMatch').mockResolvedValue(true)
    vi.spyOn(playerMatchStore, 'upsertFreshPlayerMatches').mockResolvedValue({
      upserted: 0,
      skipped: 0,
      failed: false,
    })

    const getUserGames = vi.fn(async () => ({
      games: [makeBserGame(100), makeBserGame(99)] as never[],
      next: undefined,
    }))

    const result = await refreshLatestRankMatchesForPlayer({
      prisma: {} as PrismaClient,
      deps: { getUserGames },
      uid: 'uid-noop',
      apiSeasonId: 20,
      displaySeasonId: 11,
      officialSeasonGames: 100,
      dedupe: false,
    })

    expect(result.matchesUpserted).toBe(0)
    expect(result.pagesFetched).toBeLessThanOrEqual(LATEST_REFRESH_MAX_PAGES)
  })
})

describe('snapshotFullBackfillProgress + PlayerSeasonBackfillState', () => {
  it('dbState complete면 complete', () => {
    expect(
      snapshotFullBackfillProgress({
        uid: 'uid-1',
        apiSeasonId: 39,
        rankCount: 48,
        officialSeasonGames: 48,
        dbState: {
          id: 'uid-1:39',
          uid: 'uid-1',
          apiSeasonId: 39,
          displaySeasonId: 11,
          status: 'complete',
          officialSeasonGames: 48,
          collectedGames: 48,
          nextCursor: null,
          lastCursor: null,
          lastStoppedReason: 'complete',
          lastError: null,
          pagesFetchedTotal: 10,
          rawGamesSeenTotal: 100,
          rankGamesSeenTotal: 48,
          upsertedTotal: 48,
          duplicateTotal: 0,
          startedAt: null,
          lastRunAt: null,
          finishedAt: null,
          retryAfter: null,
        },
      }).status,
    ).toBe('complete')
  })

  it('PlayerSeasonBackfillState id는 uid:apiSeasonId', () => {
    expect(backfillStateId('abc', 39)).toBe('abc:39')
  })
})
