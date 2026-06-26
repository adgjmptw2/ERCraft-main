import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'

const bserMock = vi.hoisted(() => ({
  getUserByNickname: vi.fn(),
  getUserGames: vi.fn(),
  getUserRank: vi.fn(),
  getUserStats: vi.fn(),
  getCharacterNames: vi.fn(),
  isConfigured: true,
}))

const seasonStatsCacheMock = vi.hoisted(() => ({
  readSeasonStatsCache: vi.fn(),
  readSeasonStatsCacheSnapshot: vi.fn(),
  writeSeasonStatsCache: vi.fn(),
}))

const matchesCacheMock = vi.hoisted(() => ({
  readMatchesCache: vi.fn(),
  readMatchesCacheSnapshot: vi.fn(),
  writeMatchesCache: vi.fn(),
}))

const readPlayerSeasonsCacheMock = vi.hoisted(() => vi.fn())

const mockSeasonCatalog = vi.hoisted(() => ({
  currentApiSeasonIdOrNull: () => 20,
  currentDisplaySeason: () => 11,
  displayForApiId: (apiSeasonId: number) => (apiSeasonId === 20 ? 11 : apiSeasonId - 9),
  apiIdForDisplay: (displaySeason: number) => (displaySeason === 11 ? 20 : displaySeason + 9),
}))

vi.mock('../external/bserClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../external/bserClient.js')>()
  return {
    ...actual,
    BserClient: vi.fn(function BserClientMock() {
      return bserMock
    }),
  }
})

vi.mock('../external/seasonCatalog.js', () => ({
  loadSeasonCatalog: vi.fn(async () => mockSeasonCatalog),
  parseBserSeasonNumber: (name: string) => Number(name.replace(/\D/g, '')) || null,
  bserSeasonNumberToPlayerSeason: (n: number) => (n >= 10 ? n - 9 : n),
  SeasonCatalog: class {},
}))

vi.mock('../cache/seasonStatsCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/seasonStatsCache.js')>()
  return {
    ...actual,
    readSeasonStatsCache: seasonStatsCacheMock.readSeasonStatsCache,
    readSeasonStatsCacheSnapshot: seasonStatsCacheMock.readSeasonStatsCacheSnapshot,
    writeSeasonStatsCache: seasonStatsCacheMock.writeSeasonStatsCache,
  }
})

vi.mock('../cache/playerSeasonsCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/playerSeasonsCache.js')>()
  return {
    ...actual,
    readPlayerSeasonsCache: readPlayerSeasonsCacheMock,
    writePlayerSeasonsCache: vi.fn(async () => {}),
    shouldRefetchPlayerSeasonsChunk: vi.fn(async () => false),
  }
})

vi.mock('../cache/matchesCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/matchesCache.js')>()
  return {
    ...actual,
    readMatchesCache: matchesCacheMock.readMatchesCache,
    readMatchesCacheSnapshot: matchesCacheMock.readMatchesCacheSnapshot,
    writeMatchesCache: matchesCacheMock.writeMatchesCache,
  }
})

vi.mock('../cache/seasonAggregateCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/seasonAggregateCache.js')>()
  return {
    ...actual,
    readSeasonAggregateCache: vi.fn(async () => null),
    writeSeasonAggregateCache: vi.fn(async () => {}),
  }
})

import { createApp } from '../app.js'
import { uidToUserNum } from '../external/bserMapper.js'
import { playerSeasonsCacheId } from '../cache/playerSeasonsCache.js'

const API_SEASON = 20
const lookupUid = 'bser-lookup-uid'
const canonicalUid = 'aaa-canon-uid'
const aliasUid = 'zzz-alias-uid'

type PmRow = {
  uid: string
  gameId: string
  gameMode: string
  apiSeasonId: number
  characterNum: number
  kills: number
  deaths: number
  assists: number
  teamKills: number
  damageToPlayer: number
  playedAt: Date
}

function createBootstrapPrisma(pmRows: PmRow[], participantGames: string[]) {
  const bindings = new Map<string, { canonicalUid: string; canonicalUserNum: bigint }>()
  const aliases: Array<{ canonicalUid: string; sourceUid: string; verificationMethod: string }> = []
  const seasonsCache = new Map<string, unknown>()

  return {
    matchParticipant: {
      findMany: async ({ where }: { where: { nickname?: string } }) =>
        participantGames.map((gameId) => ({ gameId, nickname: where.nickname ?? null })),
    },
    playerMatch: {
      groupBy: async ({
        where,
      }: {
        where: { gameId?: { in: string[] }; gameMode?: string; apiSeasonId?: number }
      }) => {
        const gameFilter = new Set(where.gameId?.in ?? [])
        const overlapByUid = new Map<string, number>()
        for (const row of pmRows) {
          if (where.gameMode && row.gameMode !== where.gameMode) continue
          if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) continue
          if (!gameFilter.has(row.gameId)) continue
          overlapByUid.set(row.uid, (overlapByUid.get(row.uid) ?? 0) + 1)
        }
        return [...overlapByUid.entries()].map(([uid, count]) => ({
          uid,
          _count: { gameId: count },
        }))
      },
      count: async ({ where }: { where: { uid: string; apiSeasonId?: number; gameMode?: string; gameId?: { in: string[] } } }) =>
        pmRows.filter((row) => {
          if (row.uid !== where.uid) return false
          if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) return false
          if (where.gameMode && row.gameMode !== where.gameMode) return false
          if (where.gameId?.in && !where.gameId.in.includes(row.gameId)) return false
          return true
        }).length,
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: Prisma.PlayerMatchWhereInput
        orderBy?: { gameId?: 'asc'; playedAt?: 'desc' }
        take?: number
      }) => {
        let list = pmRows.filter((row) => {
          if (typeof where.uid === 'string' && row.uid !== where.uid) return false
          if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) return false
          if (where.gameMode && row.gameMode !== where.gameMode) return false
          if (where.gameId && typeof where.gameId === 'object' && 'in' in where.gameId && where.gameId.in) {
            if (!where.gameId.in.includes(row.gameId)) return false
          }
          return true
        })
        if (orderBy?.gameId === 'asc') {
          list = [...list].sort((a, b) => a.gameId.localeCompare(b.gameId))
        }
        if (orderBy?.playedAt === 'desc') {
          list = [...list].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
        }
        return (take ? list.slice(0, take) : list).map((row) => ({
          ...row,
          characterName: '유키',
          placement: 1,
          victory: true,
          accountLevel: 500,
        }))
      },
      findFirst: async () => ({ accountLevel: 500 }),
      upsert: vi.fn(),
      findUnique: vi.fn(async () => null),
    },
    profileNicknameBinding: {
      findUnique: async ({ where }: { where: { normalizedNickname: string } }) => {
        const row = bindings.get(where.normalizedNickname)
        return row ?? null
      },
      upsert: async ({
        where,
        create,
      }: {
        where: { normalizedNickname: string }
        create: { canonicalUid: string; canonicalUserNum: bigint }
      }) => {
        bindings.set(where.normalizedNickname, {
          canonicalUid: create.canonicalUid,
          canonicalUserNum: create.canonicalUserNum,
        })
        return create
      },
    },
    profileIdentityAlias: {
      findMany: async ({ where }: { where: { canonicalUid: string; isActive?: boolean } }) =>
        aliases.filter(
          (row) =>
            row.canonicalUid === where.canonicalUid &&
            (where.isActive === undefined || where.isActive === true),
        ),
      upsert: async ({
        where,
        create,
      }: {
        where: { canonicalUid_sourceUid: { canonicalUid: string; sourceUid: string } }
        create: { canonicalUid: string; sourceUid: string; verificationMethod: string }
      }) => {
        const key = `${where.canonicalUid_sourceUid.canonicalUid}:${where.canonicalUid_sourceUid.sourceUid}`
        const existing = aliases.find(
          (row) =>
            row.canonicalUid === where.canonicalUid_sourceUid.canonicalUid &&
            row.sourceUid === where.canonicalUid_sourceUid.sourceUid,
        )
        if (!existing) {
          aliases.push({
            canonicalUid: create.canonicalUid,
            sourceUid: create.sourceUid,
            verificationMethod: create.verificationMethod,
          })
        }
        return create
      },
      createMany: vi.fn(),
    },
    playerSeasonsCache: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        seasonsCache.has(where.id) ? { id: where.id, data: seasonsCache.get(where.id) } : null,
    },
    seasonStatsCache: { findMany: vi.fn(async () => []) },
    matchesCache: { findUnique: vi.fn(async () => null) },
    playerProfileRefreshState: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    _bindings: bindings,
    _aliases: aliases,
    _seedSeasons(uid: string, body: unknown) {
      seasonsCache.set(playerSeasonsCacheId(uid, 1, 11), body)
    },
  }
}

describe('profile identity bootstrap route integration', () => {
  let app: FastifyInstance
  let prisma: ReturnType<typeof createBootstrapPrisma>

  beforeEach(async () => {
    const games = ['g1', 'g2', 'g3', 'g4']
    const pmRows: PmRow[] = [
      ...games.map((gameId) => ({
        uid: canonicalUid,
        gameId,
        gameMode: 'rank',
        apiSeasonId: API_SEASON,
        characterNum: 1,
        kills: 3,
        deaths: 1,
        assists: 2,
        teamKills: 5,
        damageToPlayer: 12000,
        playedAt: new Date('2026-06-01T00:00:00Z'),
      })),
      ...games.map((gameId) => ({
        uid: aliasUid,
        gameId,
        gameMode: 'rank',
        apiSeasonId: API_SEASON,
        characterNum: 1,
        kills: 3,
        deaths: 1,
        assists: 2,
        teamKills: 5,
        damageToPlayer: 12000,
        playedAt: new Date('2026-06-01T00:00:00Z'),
      })),
      ...games.map((gameId) => ({
        uid: lookupUid,
        gameId,
        gameMode: 'rank',
        apiSeasonId: API_SEASON,
        characterNum: 1,
        kills: 3,
        deaths: 1,
        assists: 2,
        teamKills: 5,
        damageToPlayer: 12000,
        playedAt: new Date('2026-06-01T00:00:00Z'),
      })),
    ]
    prisma = createBootstrapPrisma(pmRows, games)
    prisma._seedSeasons(canonicalUid, {
      currentSeason: 11,
      seasons: [
        {
          seasonNumber: 11,
          rank: { tier: '골드', division: 2, rp: 3000 },
          tier: '골드 2',
          wins: 10,
          losses: 5,
          games: 15,
          avgPlacement: 3,
          kda: 2.5,
          top3Rate: 40,
          winRate: 66,
          played: true,
        },
      ],
    })

    bserMock.getUserByNickname.mockResolvedValue({ uid: lookupUid, nickname: '연서' })
    bserMock.getUserRank.mockResolvedValue({
      nickname: '연서',
      mmr: 3000,
      rank: 100,
      rankSize: 1000,
    })
    bserMock.getUserStats.mockResolvedValue([
      {
        seasonId: API_SEASON,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 3000,
        nickname: '연서',
        totalGames: 4,
        totalWins: 2,
        totalTeamKills: 20,
        totalDeaths: 4,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 1,
        top1: 1,
        top3: 2,
      },
    ])
    bserMock.getUserGames.mockResolvedValue({ games: [], next: undefined })
    bserMock.getCharacterNames.mockResolvedValue(new Map([[1, '유키']]))

    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue(null)
    seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockImplementation((...args: unknown[]) =>
      seasonStatsCacheMock.readSeasonStatsCache(...args),
    )
    matchesCacheMock.readMatchesCache.mockResolvedValue(null)
    matchesCacheMock.readMatchesCacheSnapshot.mockResolvedValue(null)
    readPlayerSeasonsCacheMock.mockImplementation(async (_prisma, id: string) => {
      const row = await prisma.playerSeasonsCache.findUnique({ where: { id } })
      return row?.data ?? null
    })

    app = await createApp({ prisma: prisma as never })
    await app.ready()
  })

  it('빈 binding — /stats 첫 요청에서 PM rich stats와 binding 생성', async () => {
    const started = Date.now()
    const res = await app.inject({ method: 'GET', url: '/api/players/연서/stats' })
    const elapsed = Date.now() - started

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: {
        playerMatchCharacterStats?: Array<{ characterNum: number }>
        playerMatchCharacterStatsMeta?: { status: string; matchCount: number }
      }
      source: string
    }
    expect(body.data.playerMatchCharacterStats?.length).toBeGreaterThan(0)
    expect(body.data.playerMatchCharacterStatsMeta?.matchCount).toBe(4)
    expect(prisma._bindings.get('연서')?.canonicalUid).toBe(canonicalUid)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(elapsed).toBeLessThan(15_000)
  })

  it('빈 binding — /seasons 첫 요청에서 DB grid 반환, upstream 11회 호출 없음', async () => {
    const beforeStatsCalls = bserMock.getUserStats.mock.calls.length
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/연서/seasons?from=1&to=11',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { seasons: unknown[] }; source: string }
    expect(body.data.seasons.length).toBeGreaterThan(0)
    expect(body.source).toBe('cache')
    expect(bserMock.getUserStats.mock.calls.length).toBe(beforeStatsCalls)
    expect(prisma._bindings.get('연서')?.canonicalUid).toBe(canonicalUid)
  })

  it('기존 binding이 있으면 bootstrap 재실행하지 않음', async () => {
    prisma._bindings.set('연서', {
      canonicalUid: 'existing-canonical',
      canonicalUserNum: BigInt(uidToUserNum('existing-canonical')),
    })
    prisma._aliases.push({
      canonicalUid: 'existing-canonical',
      sourceUid: lookupUid,
      verificationMethod: 'game-id-overlap',
    })

    await app.inject({ method: 'GET', url: '/api/players/연서/stats' })
    expect(prisma._bindings.get('연서')?.canonicalUid).toBe('existing-canonical')
  })
})
