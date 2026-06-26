import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const { persistBinding, persistAliases, readBinding } = vi.hoisted(() => ({
  persistBinding: vi.fn(async () => {}),
  persistAliases: vi.fn(async () => {}),
  readBinding: vi.fn(async () => null),
}))

vi.mock('../cache/profileNicknameBinding.js', () => ({
  readPersistedNicknameBinding: readBinding,
  persistNicknameBinding: persistBinding,
}))

vi.mock('../cache/profileIdentityAlias.js', () => ({
  persistVerifiedProfileAliases: persistAliases,
}))

vi.mock('../cache/matchesCache.js', () => ({
  readMatchesCacheSnapshot: vi.fn(async () => null),
  matchesCacheId: (uid: string) => `${uid}:0`,
}))

vi.mock('../cache/playerMatchStore.js', () => ({
  isPrismaPlayerMatchReady: () => true,
}))

vi.mock('../cache/playerSeasonsCache.js', () => ({
  playerSeasonsCacheId: (uid: string, from: number, to: number) => `${uid}:${from}:${to}`,
}))

import { bootstrapProfileIdentityFromDb } from './profileIdentityBootstrap.js'

type MockPmRow = { uid: string; gameId: string }

function createBootstrapPrisma(config: {
  nickname: string
  participantGameIds: string[]
  pmRows: MockPmRow[]
  seasonsUids?: string[]
}) {
  const { nickname, participantGameIds, pmRows, seasonsUids = [] } = config

  return {
    matchParticipant: {
      findMany: vi.fn(async () => participantGameIds.map((gameId) => ({ gameId }))),
    },
    playerMatch: {
      groupBy: vi.fn(async ({ where }: { where: { gameId?: { in: string[] } } }) => {
        const gameFilter = new Set(where.gameId?.in ?? [])
        const overlapByUid = new Map<string, number>()
        for (const row of pmRows) {
          if (!gameFilter.has(row.gameId)) continue
          overlapByUid.set(row.uid, (overlapByUid.get(row.uid) ?? 0) + 1)
        }
        return [...overlapByUid.entries()].map(([uid, count]) => ({
          uid,
          _count: { gameId: count },
        }))
      }),
      count: vi.fn(async ({ where }: { where: { uid: string } }) =>
        pmRows.filter((row) => row.uid === where.uid).length,
      ),
      findMany: vi.fn(async ({ where }: { where: { uid: string } }) =>
        pmRows
          .filter((row) => row.uid === where.uid)
          .sort((a, b) => a.gameId.localeCompare(b.gameId))
          .map((row) => ({ gameId: row.gameId })),
      ),
    },
    playerSeasonsCache: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        seasonsUids.some((uid) => where.id.startsWith(`${uid}:`)) ? { id: where.id } : null,
      ),
    },
  } as unknown as PrismaClient
}

describe('bootstrapProfileIdentityFromDb', () => {
  beforeEach(() => {
    persistBinding.mockClear()
    persistAliases.mockClear()
    readBinding.mockReset()
    readBinding.mockResolvedValue(null)
  })

  it('binding/alias 비어 있고 gameId 증거만 있으면 identity 자동 복원', async () => {
    const games = ['g1', 'g2', 'g3', 'g4']
  const pmRows: MockPmRow[] = [
      ...games.map((gameId) => ({ uid: 'canon-uid', gameId })),
      ...games.map((gameId) => ({ uid: 'alias-uid', gameId })),
    ]
    const prisma = createBootstrapPrisma({
      nickname: '연서',
      participantGameIds: games,
      pmRows,
      seasonsUids: ['canon-uid'],
    })

    const result = await bootstrapProfileIdentityFromDb(prisma, '연서', 'alias-uid', 39)
    expect(result?.bootstrapped).toBe(true)
    expect(result?.canonicalUid).toBe('alias-uid')
    expect(persistBinding).toHaveBeenCalledWith(prisma, '연서', 'alias-uid')
    expect(persistAliases).toHaveBeenCalled()
  })

  it('gameId overlap 없는 동일 fingerprint 후보는 alias로 저장하지 않음', async () => {
    const prisma = createBootstrapPrisma({
      nickname: '테스트',
      participantGameIds: ['g1', 'g2', 'g3'],
      pmRows: [
        { uid: 'rich-a', gameId: 'g1' },
        { uid: 'rich-a', gameId: 'g2' },
        { uid: 'rich-a', gameId: 'g3' },
        { uid: 'rich-b', gameId: 'x1' },
        { uid: 'rich-b', gameId: 'x2' },
        { uid: 'rich-b', gameId: 'x3' },
      ],
    })

    const result = await bootstrapProfileIdentityFromDb(prisma, '테스트', 'rich-a', 39)
    expect(result?.canonicalUid).toBe('rich-a')
    expect(persistAliases).not.toHaveBeenCalled()
  })

  it('동점 cluster가 서로 다른 game set이면 bootstrap하지 않음', async () => {
    const prisma = createBootstrapPrisma({
      nickname: '모호',
      participantGameIds: ['g1', 'g2', 'g3', 'g4'],
      pmRows: [
        { uid: 'set-a-1', gameId: 'g1' },
        { uid: 'set-a-1', gameId: 'g2' },
        { uid: 'set-a-1', gameId: 'g3' },
        { uid: 'set-b-1', gameId: 'g1' },
        { uid: 'set-b-1', gameId: 'g2' },
        { uid: 'set-b-1', gameId: 'g4' },
      ],
    })

    const result = await bootstrapProfileIdentityFromDb(prisma, '모호', 'lookup', 39)
    expect(result).toBeNull()
    expect(persistBinding).not.toHaveBeenCalled()
  })

  it('기존 binding이 있으면 bootstrap하지 않음', async () => {
    readBinding.mockResolvedValueOnce({ canonicalUid: 'existing', canonicalUserNum: 1 } as never)
    const prisma = createBootstrapPrisma({
      nickname: '연서',
      participantGameIds: ['g1'],
      pmRows: [{ uid: 'canon', gameId: 'g1' }],
    })
    const result = await bootstrapProfileIdentityFromDb(prisma, '연서', 'lookup', 39)
    expect(result).toBeNull()
  })

  it('participant gameId가 없으면 bootstrap하지 않음', async () => {
    const prisma = createBootstrapPrisma({
      nickname: '없음',
      participantGameIds: [],
      pmRows: [],
    })
    const result = await bootstrapProfileIdentityFromDb(prisma, '없음', 'lookup', 39)
    expect(result).toBeNull()
  })
})
