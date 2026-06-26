import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { enqueueCollectorGame, enqueueCollectorUser, retryDelay } from './queue.js'

interface InMemoryGameRow {
  gameId: string
  priority: number
  seasonId: number | null
  matchingMode: number | null
}

interface InMemoryUserRow {
  userNum: bigint
  uid: string | null
  lastKnownNickname: string | null
  priority: number
}

function createQueuePrismaMock(): PrismaClient {
  const games = new Map<string, InMemoryGameRow>()
  const users = new Map<bigint, InMemoryUserRow>()

  return {
    collectorGameQueue: {
      findUnique: vi.fn(async ({ where }: { where: { gameId: string } }) => {
        return games.get(where.gameId) ?? null
      }),
      create: vi.fn(async ({ data }: { data: InMemoryGameRow }) => {
        games.set(data.gameId, { ...data })
        return data
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { gameId: string }
          data: Partial<InMemoryGameRow>
        }) => {
          const current = games.get(where.gameId)
          if (!current) throw new Error('missing game')
          const next = { ...current, ...data }
          games.set(where.gameId, next)
          return next
        },
      ),
    },
    collectorUserQueue: {
      findUnique: vi.fn(async ({ where }: { where: { userNum: bigint } }) => {
        return users.get(where.userNum) ?? null
      }),
      create: vi.fn(async ({ data }: { data: InMemoryUserRow }) => {
        users.set(data.userNum, { ...data })
        return data
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userNum: bigint }
          data: Partial<InMemoryUserRow>
        }) => {
          const current = users.get(where.userNum)
          if (!current) throw new Error('missing user')
          const next = { ...current, ...data }
          users.set(where.userNum, next)
          return next
        },
      ),
    },
  } as unknown as PrismaClient
}

describe('collector queue', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('dedupes game queue by gameId and only lowers priority on repeat enqueue', async () => {
    const prisma = createQueuePrismaMock()

    await expect(
      enqueueCollectorGame(prisma, {
        gameId: '12345',
        priority: 80,
        seasonId: 11,
        matchingMode: 3,
      }),
    ).resolves.toBe(true)
    await expect(
      enqueueCollectorGame(prisma, {
        gameId: '12345',
        priority: 10,
        seasonId: 12,
        matchingMode: 2,
      }),
    ).resolves.toBe(false)

    const row = await prisma.collectorGameQueue.findUnique({ where: { gameId: '12345' } })
    expect(row?.priority).toBe(10)
    expect(row?.seasonId).toBe(11)
    expect(row?.matchingMode).toBe(3)
  })

  it('dedupes user queue by official userNum without random probing', async () => {
    const prisma = createQueuePrismaMock()

    await expect(
      enqueueCollectorUser(prisma, {
        uid: 'uid-a',
        userNum: 777n,
        nickname: 'first',
        priority: 90,
      }),
    ).resolves.toBe(true)
    await expect(
      enqueueCollectorUser(prisma, {
        uid: 'uid-b',
        userNum: 777n,
        nickname: 'second',
        priority: 20,
      }),
    ).resolves.toBe(false)

    const row = await prisma.collectorUserQueue.findUnique({ where: { userNum: 777n } })
    expect(row?.uid).toBe('uid-a')
    expect(row?.lastKnownNickname).toBe('first')
    expect(row?.priority).toBe(20)
  })

  it('uses exponential retry delay capped at one hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T00:00:00.000Z'))

    expect(retryDelay(1).toISOString()).toBe('2026-06-23T00:00:30.000Z')
    expect(retryDelay(3).toISOString()).toBe('2026-06-23T00:02:00.000Z')
    expect(retryDelay(99).toISOString()).toBe('2026-06-23T01:00:00.000Z')
  })
})
