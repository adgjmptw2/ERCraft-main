import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  isRecentMatchFreshnessInflight,
  prepareRecentMatchFreshnessCheck,
  resetRecentMatchFreshnessInflightForTests,
  runRecentMatchFreshnessCheck,
} from './recentMatchFreshness.js'

interface MockState {
  manualRefreshedAt: Date | null
  lastCheckedAt: Date | null
  lastFailedAt: Date | null
  nextRetryAt: Date | null
}

function createPrismaMock(initial: Partial<MockState> = {}) {
  let stored: MockState = {
    manualRefreshedAt: null,
    lastCheckedAt: initial.lastCheckedAt ?? null,
    lastFailedAt: initial.lastFailedAt ?? null,
    nextRetryAt: initial.nextRetryAt ?? null,
  }
  return {
    playerMatch: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    playerProfileRefreshState: {
      findUnique: async () => ({ ...stored }),
      upsert: async ({
        create,
        update,
      }: {
        create: Partial<MockState>
        update: Partial<MockState>
      }) => {
        stored = {
          ...stored,
          ...create,
          ...update,
        }
        return stored
      },
    },
    matchesCache: {
      delete: vi.fn().mockResolvedValue({}),
    },
  } as never
}

const baseDeps = {
  logger: { info: vi.fn(), warn: vi.fn() } as never,
  canonicalUid: 'uid-1',
  hasProfileCache: true,
  explicitRefresh: false,
  applyNewMatches: vi.fn(),
}

describe('recentMatchFreshness', () => {
  beforeEach(() => {
    resetRecentMatchFreshnessInflightForTests()
    vi.useRealTimers()
  })

  it('TTL 내 재방문 — upstream 호출 없음', async () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const prisma = createPrismaMock({ lastCheckedAt: new Date('2026-06-19T11:50:00Z') })
    const collectRecentMatches = vi.fn()
    const result = await prepareRecentMatchFreshnessCheck({
      prisma,
      ...baseDeps,
      now,
      collectRecentMatches,
    })
    expect(result.status).toBe('skipped-fresh')
    expect(collectRecentMatches).not.toHaveBeenCalled()
  })

  it('stale 사용자 — 확인 1회 스케줄', async () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const prisma = createPrismaMock({ lastCheckedAt: new Date('2026-06-18T12:00:00Z') })
    const collectRecentMatches = vi.fn().mockResolvedValue({
      newMatchCount: 0,
      pagesFetched: 1,
      detailFetchCount: 0,
    })
    const result = await prepareRecentMatchFreshnessCheck({
      prisma,
      ...baseDeps,
      now,
      collectRecentMatches,
    })
    expect(result.status).toBe('scheduled')
    await vi.waitFor(() => expect(collectRecentMatches).toHaveBeenCalledTimes(1))
  })

  it('cooldown 중 — 즉시 재스케줄하지 않음', async () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const prisma = createPrismaMock({
      lastCheckedAt: null,
      nextRetryAt: new Date('2026-06-19T12:04:00Z'),
      lastFailedAt: new Date('2026-06-19T11:59:00Z'),
    })
    const collectRecentMatches = vi.fn()
    const result = await prepareRecentMatchFreshnessCheck({
      prisma,
      ...baseDeps,
      now,
      collectRecentMatches,
    })
    expect(result.status).toBe('skipped-cooldown')
    expect(collectRecentMatches).not.toHaveBeenCalled()
  })

  it('inflight 종료 후 cooldown이면 연속 재시도하지 않음', async () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const prisma = createPrismaMock({ lastCheckedAt: null })
    const collectRecentMatches = vi.fn().mockRejectedValue(new Error('upstream failed'))
    const deps = {
      prisma,
      ...baseDeps,
      now,
      failureCooldownMs: 300_000,
      collectRecentMatches,
      applyNewMatches: vi.fn(),
    }

    await runRecentMatchFreshnessCheck(deps)
    expect(isRecentMatchFreshnessInflight('uid-1')).toBe(false)

    const second = await prepareRecentMatchFreshnessCheck(deps)
    expect(second.status).toBe('skipped-cooldown')
    expect(collectRecentMatches).toHaveBeenCalledTimes(1)
  })

  it('cooldown 만료 후 stale이면 재시도', async () => {
    const now = new Date('2026-06-19T12:10:00Z')
    const prisma = createPrismaMock({
      lastCheckedAt: null,
      nextRetryAt: new Date('2026-06-19T12:05:00Z'),
      lastFailedAt: new Date('2026-06-19T12:00:00Z'),
    })
    const collectRecentMatches = vi.fn().mockResolvedValue({
      newMatchCount: 0,
      pagesFetched: 1,
      detailFetchCount: 0,
    })
    const result = await prepareRecentMatchFreshnessCheck({
      prisma,
      ...baseDeps,
      now,
      collectRecentMatches,
    })
    expect(result.status).toBe('scheduled')
    await vi.waitFor(() => expect(collectRecentMatches).toHaveBeenCalledTimes(1))
  })

  it('동시 요청 — inflight dedupe', async () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const prisma = createPrismaMock()
    let resolveCollect: (() => void) | undefined
    const collectRecentMatches = vi.fn(
      () =>
        new Promise<{ newMatchCount: number; pagesFetched: number; detailFetchCount: number }>(
          (resolve) => {
            resolveCollect = () =>
              resolve({ newMatchCount: 0, pagesFetched: 1, detailFetchCount: 0 })
          },
        ),
    )
    const deps = {
      prisma,
      ...baseDeps,
      now,
      collectRecentMatches,
      applyNewMatches: vi.fn(),
    }
    const first = await prepareRecentMatchFreshnessCheck(deps)
    expect(first.status).toBe('scheduled')
    await new Promise((resolve) => setImmediate(resolve))
    expect(isRecentMatchFreshnessInflight('uid-1')).toBe(true)
    const second = await prepareRecentMatchFreshnessCheck(deps)
    expect(second.status).toBe('skipped-inflight')
    resolveCollect?.()
    await new Promise((resolve) => setImmediate(resolve))
    await vi.waitFor(() => expect(isRecentMatchFreshnessInflight('uid-1')).toBe(false))
    expect(collectRecentMatches).toHaveBeenCalledTimes(1)
  })

  it('신규 경기 없음 — lastCheckedAt 기록, failure 필드 초기화', async () => {
    const now = new Date('2026-06-19T12:00:00Z')
    vi.setSystemTime(now)
    const prisma = createPrismaMock({
      lastFailedAt: new Date('2026-06-19T11:00:00Z'),
      nextRetryAt: new Date('2026-06-19T11:05:00Z'),
    })
    await runRecentMatchFreshnessCheck({
      prisma,
      ...baseDeps,
      now,
      collectRecentMatches: async () => ({
        newMatchCount: 0,
        pagesFetched: 1,
        detailFetchCount: 0,
      }),
      applyNewMatches: vi.fn(),
    })
    const { readRecentMatchFreshnessState } = await import('./profileRefreshState.js')
    await expect(readRecentMatchFreshnessState(prisma, 'uid-1')).resolves.toMatchObject({
      lastCheckedAt: now,
      lastFailedAt: null,
      nextRetryAt: null,
    })
  })

  it('확인 실패 — lastCheckedAt 유지, nextRetryAt 기록', async () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const previous = new Date('2026-06-18T12:00:00Z')
    const prisma = createPrismaMock({ lastCheckedAt: previous })
    await runRecentMatchFreshnessCheck({
      prisma,
      ...baseDeps,
      now,
      failureCooldownMs: 300_000,
      collectRecentMatches: async () => {
        throw new Error('upstream failed')
      },
      applyNewMatches: vi.fn(),
    })
    const { readRecentMatchFreshnessState } = await import('./profileRefreshState.js')
    await expect(readRecentMatchFreshnessState(prisma, 'uid-1')).resolves.toMatchObject({
      lastCheckedAt: previous,
      lastFailedAt: now,
      nextRetryAt: new Date('2026-06-19T12:05:00Z'),
    })
  })
})

describe('profileDataRefresh helpers', () => {
  it('resolveProfileRefreshSkipReason — no new games', async () => {
    const { resolveProfileRefreshSkipReason } = await import('./profileRefreshState.js')
    expect(
      resolveProfileRefreshSkipReason({
        newGamesInserted: 0,
        gamesFetched: 1,
        latestGameIdBefore: '100',
        latestGameIdAfter: '100',
      }),
    ).toBe('no-new-games')
  })

  it('buildProfileRefreshMeta — matchesUpdated when inserted', async () => {
    const { buildProfileRefreshMeta } = await import('./profileRefreshState.js')
    const meta = buildProfileRefreshMeta({
      rankUpdated: true,
      latestGameIdBefore: '1',
      latestGameIdAfter: '2',
      gamesFetched: 1,
      newGamesInserted: 1,
      statsInvalidated: true,
      aggregateInvalidated: true,
      snapshotInvalidatedOrRebuilt: true,
    })
    expect(meta.matchesUpdated).toBe(true)
    expect(meta.newGamesInserted).toBe(1)
  })
})
