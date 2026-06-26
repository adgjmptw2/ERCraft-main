import { describe, expect, it } from 'vitest'

import {
  shouldEnqueueSeasonBackfill,
  snapshotFullBackfillProgress,
} from './playerMatchBackfill.js'

/**
 * 39.9C-INVESTIGATION — 원인 재현용 (수정 아님)
 * complete + 충분한 PlayerMatch일 때 enqueue/backfill 판정을 문서화한다.
 */
describe('cache investigation — backfill enqueue policy', () => {
  it('complete + rankCount >= official이면 shouldEnqueueSeasonBackfill=false', async () => {
    const prisma = {
      playerSeasonBackfillState: {
        findUnique: async () => ({
          id: 'uid:39',
          status: 'complete',
          collectedGames: 48,
          officialSeasonGames: 48,
        }),
      },
    }
    const result = await shouldEnqueueSeasonBackfill(
      prisma as never,
      'uid-complete',
      39,
      48,
      48,
    )
    expect(result).toBe(false)
  })

  it('BackfillState 없고 rankCount < official이면 enqueue=true', async () => {
    const prisma = {
      playerSeasonBackfillState: {
        findUnique: async () => null,
      },
    }
    const result = await shouldEnqueueSeasonBackfill(
      prisma as never,
      'uid-partial',
      39,
      335,
      0,
    )
    expect(result).toBe(true)
  })
})

describe('cache investigation — seasonAggregateRefreshPlan equivalent', () => {
  function refreshPlan(params: {
    seasonDataComplete: boolean
    cacheStatus: string
    coverageComplete: boolean
    backfillStatus?: string
  }) {
    if (params.seasonDataComplete) return { reason: null, skipReason: 'season-data-complete' }
    if (params.backfillStatus === 'complete') {
      return { reason: null, skipReason: 'backfill-complete' }
    }
    if (params.cacheStatus === 'ready' && params.coverageComplete) {
      return { reason: null, skipReason: 'ready' }
    }
    return { reason: 'warmup', skipReason: undefined }
  }

  it('seasonDataComplete면 enqueue skip', () => {
    expect(
      refreshPlan({ seasonDataComplete: true, cacheStatus: 'ready', coverageComplete: true })
        .skipReason,
    ).toBe('season-data-complete')
  })

  it('backfill complete면 enqueue skip', () => {
    expect(
      refreshPlan({
        seasonDataComplete: false,
        cacheStatus: 'partial',
        coverageComplete: false,
        backfillStatus: 'complete',
      }).skipReason,
    ).toBe('backfill-complete')
  })
})

describe('cache investigation — apiSeasonId key format', () => {
  it('SeasonAggregateCache id = uid:apiSeasonId', () => {
    expect(`${'uid-fencing'}:${39}`).toBe('uid-fencing:39')
  })

  it('displaySeasonId(11) != apiSeasonId(39) — key는 apiSeasonId 기준', () => {
    const displaySeasonId = 11
    const apiSeasonId = 39
    expect(displaySeasonId).not.toBe(apiSeasonId)
    const cacheKey = `uid:${apiSeasonId}`
    expect(cacheKey).toBe('uid:39')
    expect(cacheKey).not.toBe(`uid:${displaySeasonId}`)
  })
})

describe('cache investigation — backfill progress snapshot', () => {
  it('complete dbState면 status=complete', () => {
    expect(
      snapshotFullBackfillProgress({
        uid: 'u',
        apiSeasonId: 39,
        rankCount: 48,
        officialSeasonGames: 48,
        dbState: {
          id: 'u:39',
          uid: 'u',
          apiSeasonId: 39,
          displaySeasonId: 11,
          status: 'complete',
          officialSeasonGames: 48,
          collectedGames: 48,
          nextCursor: 123,
          lastCursor: null,
          lastStoppedReason: 'complete',
          lastError: null,
          pagesFetchedTotal: 15,
          rawGamesSeenTotal: 0,
          rankGamesSeenTotal: 0,
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
})
