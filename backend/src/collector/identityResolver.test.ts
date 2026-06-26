import type { CollectorIdentityQueue, PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BserClient, BserUserGame } from '../external/bserClient.js'
import { loadCollectorConfig } from './config.js'
import {
  applyVerifiedIdentity,
  clearIdentityNicknameCacheForTests,
  resolveCollectorIdentity,
} from './identityResolver.js'

function identityRow(
  overrides: Partial<CollectorIdentityQueue> = {},
): CollectorIdentityQueue {
  return {
    id: 1n,
    sourceGameId: '10001',
    nickname: 'TestPlayer',
    characterNum: 1,
    teamNumber: 2,
    seasonId: 11,
    matchingMode: 3,
    status: 'pending',
    priority: 25,
    attemptCount: 0,
    nextAttemptAt: null,
    resolvedUid: null,
    resolvedUserNum: null,
    verificationStatus: null,
    nicknameResolveCount: 0,
    verifyGameCount: 0,
    totalRequestCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

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

function createPrismaMock(): PrismaClient {
  return {
    collectorIdentityQueue: {
      groupBy: vi.fn(async () => [{ _count: { nickname: 1 } }]),
    },
    matchParticipant: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 2),
    },
    matchDetail: {
      findUnique: vi.fn(async () => ({
        rawJson: [game()],
      })),
    },
    $transaction: vi.fn(async (fn: (tx: PrismaClient) => Promise<unknown>) => fn(createPrismaMock())),
  } as unknown as PrismaClient
}

function callApiAlways<T>(): (category: string, fn: () => Promise<T>) => Promise<{ ok: true; value: T }> {
  return async (_category, fn) => ({ ok: true, value: await fn() })
}

describe('resolveCollectorIdentity', () => {
  beforeEach(() => {
    clearIdentityNicknameCacheForTests()
    vi.restoreAllMocks()
  })

  it('nickname 없으면 API를 호출하지 않는다', async () => {
    const prisma = createPrismaMock()
    const bser = {
      getUserByNickname: vi.fn(),
      getUserGames: vi.fn(),
    } as unknown as BserClient

    const result = await resolveCollectorIdentity(
      prisma,
      bser,
      identityRow({ nickname: '   ' }),
      loadCollectorConfig({ workerId: 'test' }),
      callApiAlways(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe('unresolved-no-nickname')
    expect(bser.getUserByNickname).not.toHaveBeenCalled()
  })

  it('기존 nickname binding이 있으면 API 없이 해석한다', async () => {
    const prisma = createPrismaMock()
    vi.mocked(prisma.matchParticipant.findMany).mockResolvedValue([])
    vi.spyOn(
      await import('../cache/profileNicknameBinding.js'),
      'readPersistedNicknameBinding',
    ).mockResolvedValue({
      canonicalUid: 'uid-bound',
      canonicalUserNum: 123,
    })

    const bser = {
      getUserByNickname: vi.fn(),
      getUserGames: vi.fn(),
    } as unknown as BserClient

    const result = await resolveCollectorIdentity(
      prisma,
      bser,
      identityRow(),
      loadCollectorConfig({ workerId: 'test' }),
      callApiAlways(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.uid).toBe('uid-bound')
    expect(bser.getUserByNickname).not.toHaveBeenCalled()
  })

  it('공식 nickname resolve 후 sourceGameId 검증에 성공한다', async () => {
    const prisma = createPrismaMock()
    const bser = {
      getUserByNickname: vi.fn(async () => ({ uid: 'uid-new', nickname: 'TestPlayer' })),
      getUserGames: vi.fn(async () => ({
        games: [game({ gameId: 10001 })],
        next: undefined,
      })),
    } as unknown as BserClient

    const result = await resolveCollectorIdentity(
      prisma,
      bser,
      identityRow(),
      loadCollectorConfig({ workerId: 'test', identityNormalPages: 3, identityDeepPages: 20 }),
      callApiAlways(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.uid).toBe('uid-new')
    expect(result.requestStats.nicknameResolveCount).toBe(1)
    expect(result.requestStats.verifyGameCount).toBe(1)
  })

  it('sourceGameId 불일치면 연결하지 않는다', async () => {
    const prisma = createPrismaMock()
    const bser = {
      getUserByNickname: vi.fn(async () => ({ uid: 'uid-new', nickname: 'TestPlayer' })),
      getUserGames: vi.fn(async () => ({
        games: [game({ gameId: 99999 })],
        next: undefined,
      })),
    } as unknown as BserClient

    const result = await resolveCollectorIdentity(
      prisma,
      bser,
      identityRow(),
      loadCollectorConfig({ workerId: 'test', identityNormalPages: 2, identityDeepPages: 2 }),
      callApiAlways(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(['unresolved-game-mismatch', 'unresolved-game-out-of-window']).toContain(result.errorCode)
  })

  it('nickname 충돌 후보가 있으면 연결하지 않는다', async () => {
    const prisma = createPrismaMock()
    vi.mocked(prisma.matchParticipant.findMany).mockResolvedValue([
      { uid: 'uid-a' },
      { uid: 'uid-b' },
    ] as never)

    const bser = {
      getUserByNickname: vi.fn(),
      getUserGames: vi.fn(),
    } as unknown as BserClient

    const result = await resolveCollectorIdentity(
      prisma,
      bser,
      identityRow(),
      loadCollectorConfig({ workerId: 'test' }),
      callApiAlways(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe('unresolved-ambiguous')
    expect(bser.getUserByNickname).not.toHaveBeenCalled()
  })
})

describe('applyVerifiedIdentity', () => {
  it('verified 후 participant uid를 연결하고 사용자 큐에 등록한다', async () => {
    const txMock = createPrismaMock()
    const prisma = {
      ...createPrismaMock(),
      $transaction: vi.fn(async (fn: (tx: PrismaClient) => Promise<unknown>) => fn(txMock)),
    } as unknown as PrismaClient
    vi.spyOn(await import('./queue.js'), 'enqueueCollectorUser').mockResolvedValue(true)
    vi.spyOn(await import('../cache/playerMatchStore.js'), 'upsertPlayerMatches').mockResolvedValue(1)
    vi.spyOn(await import('../cache/profileNicknameBinding.js'), 'persistNicknameBinding').mockResolvedValue()
    vi.spyOn(await import('../cache/profileIdentityAlias.js'), 'persistVerifiedProfileAliases').mockResolvedValue()

    const result = await applyVerifiedIdentity(prisma, identityRow(), 'uid-new', {
      verificationStatus: 'verified-game-overlap',
      characterNames: new Map([[1, 'TestChar']]),
      discoveryDepth: 1,
    })

    expect(txMock.matchParticipant.updateMany).toHaveBeenCalled()
    expect(result.userEnqueued).toBe(true)
    expect(result.playerMatchRowsWritten).toBe(1)
  })
})
