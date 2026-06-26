import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const seasonAggregateCacheMock = vi.hoisted(() => ({
  readSeasonAggregateCache: vi.fn(),
  writeSeasonAggregateCache: vi.fn(),
}))

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
    readPlayerSeasonsCache: vi.fn(async () => null),
    writePlayerSeasonsCache: vi.fn(async () => {}),
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
    readSeasonAggregateCache: seasonAggregateCacheMock.readSeasonAggregateCache,
    writeSeasonAggregateCache: seasonAggregateCacheMock.writeSeasonAggregateCache,
  }
})

import { createApp } from '../app.js'
import { uidToUserNum } from '../external/bserMapper.js'
import { clearSeasonAggregateRefreshQueueForTests, isSeasonAggregateRefreshInFlight } from '../cache/seasonAggregateRefreshQueue.js'
import { clearFullBackfillStateForTests } from '../cache/playerMatchBackfill.js'
import { resetRecentMatchFreshnessInflightForTests } from '../cache/recentMatchFreshness.js'
import { loadSeasonCatalog } from '../external/seasonCatalog.js'
import type { Prisma } from '@prisma/client'
import * as playerMatchStore from '../cache/playerMatchStore.js'

const testUser = { uid: 'uid-test-player', nickname: 'TestPlayer' }

const BSER_GAMES_PAGE_SIZE = 10

function makeBserGame(gameId: number, matchingMode = 3) {
  return {
    gameId,
    accountLevel: 510,
    seasonId: 20,
    matchingMode,
    matchingTeamMode: 3,
    characterNum: 1,
    characterLevel: 20,
    skinCode: 1_001_001,
    bestWeapon: 20,
    tacticalSkillGroup: 120,
    traitFirstCore: 7_100_101,
    traitFirstSub: [7_110_701, 7_110_601],
    traitSecondSub: [7_310_201, 7_310_301],
    equipment: { '0': 119_503, '1': 202_503 },
    equipmentGrade: { '0': 5, '1': 5 },
    routeIdOfStart: 7143,
    routeSlotId: 0,
    gameRank: 1,
    playerKill: 1,
    playerAssistant: 0,
    monsterKill: 0,
    victory: 1,
    playTime: 1234,
    startDtm: '2026-06-01T00:00:00Z',
  }
}

type PlayerMatchRow = {
  id: bigint
  uid: string
  gameId: string
  gameMode: string
  apiSeasonId: number
  displaySeasonId: number
  playedAt: Date
  characterNum: number
  characterName: string | null
  placement: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  teamKills: number | null
  damageToPlayer: number | null
  victory: boolean | null
  rpAfter: number | null
  rpDelta: number | null
  gameDuration?: number | null
  cobaltInfusions?: unknown
  accountLevel?: number | null
  characterLevel?: number | null
  skinCode?: number | null
  bestWeapon?: number | null
  tacticalSkillGroup?: number | null
  traitFirstCore?: number | null
  traitFirstSub?: unknown
  traitSecondSub?: unknown
  equipment?: unknown
  equipmentGrade?: unknown
  routeIdOfStart?: number | null
  routeSlotId?: number | null
}

function filterPlayerMatchRows(
  rows: Map<string, PlayerMatchRow>,
  where: Prisma.PlayerMatchWhereInput,
): PlayerMatchRow[] {
  return [...rows.values()].filter((row) => {
    if (where.uid !== undefined) {
      if (typeof where.uid === 'string') {
        if (row.uid !== where.uid) return false
      } else if (where.uid.in) {
        if (!where.uid.in.includes(row.uid)) return false
      }
    }
    if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) return false
    if (where.gameMode !== undefined && row.gameMode !== where.gameMode) return false
    if (
      where.accountLevel !== undefined &&
      typeof where.accountLevel === 'object' &&
      where.accountLevel !== null &&
      'not' in where.accountLevel &&
      where.accountLevel.not === null &&
      row.accountLevel === null
    ) {
      return false
    }
    return true
  })
}

function createPlayerMatchPrisma(rows: Map<string, PlayerMatchRow>) {
  let nextId = 1n
  return {
    playerMatch: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { uid_gameId: { uid: string; gameId: string } }
        create: Prisma.PlayerMatchCreateInput
        update: Prisma.PlayerMatchUpdateInput
      }) => {
        const key = `${where.uid_gameId.uid}:${where.uid_gameId.gameId}`
        const existing = rows.get(key)
        if (existing) {
          const merged: PlayerMatchRow = {
            ...existing,
            gameMode: typeof update.gameMode === 'string' ? update.gameMode : existing.gameMode,
            apiSeasonId:
              typeof update.apiSeasonId === 'number' ? update.apiSeasonId : existing.apiSeasonId,
            displaySeasonId:
              typeof update.displaySeasonId === 'number'
                ? update.displaySeasonId
                : existing.displaySeasonId,
            playedAt: update.playedAt instanceof Date ? update.playedAt : existing.playedAt,
            characterNum:
              typeof update.characterNum === 'number' ? update.characterNum : existing.characterNum,
            characterName:
              update.characterName === null || typeof update.characterName === 'string'
                ? update.characterName
                : existing.characterName,
            placement:
              update.placement === null || typeof update.placement === 'number'
                ? update.placement
                : existing.placement,
            kills:
              update.kills === null || typeof update.kills === 'number'
                ? update.kills
                : existing.kills,
            deaths:
              update.deaths === null || typeof update.deaths === 'number'
                ? update.deaths
                : existing.deaths,
            assists:
              update.assists === null || typeof update.assists === 'number'
                ? update.assists
                : existing.assists,
            teamKills:
              update.teamKills === null || typeof update.teamKills === 'number'
                ? update.teamKills
                : existing.teamKills,
            damageToPlayer:
              update.damageToPlayer === null || typeof update.damageToPlayer === 'number'
                ? update.damageToPlayer
                : existing.damageToPlayer,
            victory:
              update.victory === null || typeof update.victory === 'boolean'
                ? update.victory
                : existing.victory,
            rpAfter:
              update.rpAfter === null || typeof update.rpAfter === 'number'
                ? update.rpAfter
                : existing.rpAfter,
            rpDelta:
              update.rpDelta === null || typeof update.rpDelta === 'number'
                ? update.rpDelta
                : existing.rpDelta,
            gameDuration:
              update.gameDuration === null || typeof update.gameDuration === 'number'
                ? update.gameDuration
                : existing.gameDuration,
            cobaltInfusions:
              update.cobaltInfusions !== undefined ? update.cobaltInfusions : existing.cobaltInfusions,
            accountLevel:
              update.accountLevel === null || typeof update.accountLevel === 'number'
                ? update.accountLevel
                : existing.accountLevel,
            characterLevel:
              update.characterLevel === null || typeof update.characterLevel === 'number'
                ? update.characterLevel
                : existing.characterLevel,
            skinCode:
              update.skinCode === null || typeof update.skinCode === 'number'
                ? update.skinCode
                : existing.skinCode,
            bestWeapon:
              update.bestWeapon === null || typeof update.bestWeapon === 'number'
                ? update.bestWeapon
                : existing.bestWeapon,
            tacticalSkillGroup:
              update.tacticalSkillGroup === null || typeof update.tacticalSkillGroup === 'number'
                ? update.tacticalSkillGroup
                : existing.tacticalSkillGroup,
            traitFirstCore:
              update.traitFirstCore === null || typeof update.traitFirstCore === 'number'
                ? update.traitFirstCore
                : existing.traitFirstCore,
            traitFirstSub:
              update.traitFirstSub !== undefined ? update.traitFirstSub : existing.traitFirstSub,
            traitSecondSub:
              update.traitSecondSub !== undefined
                ? update.traitSecondSub
                : existing.traitSecondSub,
            equipment: update.equipment !== undefined ? update.equipment : existing.equipment,
            equipmentGrade:
              update.equipmentGrade !== undefined ? update.equipmentGrade : existing.equipmentGrade,
            routeIdOfStart:
              update.routeIdOfStart === null || typeof update.routeIdOfStart === 'number'
                ? update.routeIdOfStart
                : existing.routeIdOfStart,
            routeSlotId:
              update.routeSlotId === null || typeof update.routeSlotId === 'number'
                ? update.routeSlotId
                : existing.routeSlotId,
          }
          rows.set(key, merged)
          return merged
        }
        const created: PlayerMatchRow = {
          id: nextId,
          uid: create.uid,
          gameId: create.gameId,
          gameMode: create.gameMode,
          apiSeasonId: create.apiSeasonId,
          displaySeasonId: create.displaySeasonId,
          playedAt: create.playedAt instanceof Date ? create.playedAt : new Date(create.playedAt),
          characterNum: create.characterNum,
          characterName: create.characterName ?? null,
          placement: create.placement ?? null,
          kills: create.kills ?? null,
          deaths: create.deaths ?? null,
          assists: create.assists ?? null,
          teamKills: create.teamKills ?? null,
          damageToPlayer: create.damageToPlayer ?? null,
          victory: create.victory ?? null,
          rpAfter: create.rpAfter ?? null,
          rpDelta: create.rpDelta ?? null,
          gameDuration: create.gameDuration ?? null,
          cobaltInfusions: create.cobaltInfusions ?? null,
          accountLevel: create.accountLevel ?? null,
          characterLevel: create.characterLevel ?? null,
          skinCode: create.skinCode ?? null,
          bestWeapon: create.bestWeapon ?? null,
          tacticalSkillGroup: create.tacticalSkillGroup ?? null,
          traitFirstCore: create.traitFirstCore ?? null,
          traitFirstSub: create.traitFirstSub ?? null,
          traitSecondSub: create.traitSecondSub ?? null,
          equipment: create.equipment ?? null,
          equipmentGrade: create.equipmentGrade ?? null,
          routeIdOfStart: create.routeIdOfStart ?? null,
          routeSlotId: create.routeSlotId ?? null,
        }
        nextId += 1n
        rows.set(key, created)
        return created
      },
      findMany: async ({
        where,
        orderBy,
        take,
        skip,
      }: {
        where: Prisma.PlayerMatchWhereInput
        orderBy: { playedAt: 'desc' }
        take?: number
        skip?: number
      }) => {
        let list = filterPlayerMatchRows(rows, where)
        if (orderBy.playedAt === 'desc') {
          list = list.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
        }
        const offset = skip ?? 0
        const limit = take ?? list.length
        return list.slice(offset, offset + limit)
      },
      count: async ({ where }: { where: Prisma.PlayerMatchWhereInput }) =>
        filterPlayerMatchRows(rows, where).length,
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Prisma.PlayerMatchWhereInput
        orderBy?: { playedAt: 'desc' }
        select?: { accountLevel: true }
      }) => {
        let list = filterPlayerMatchRows(rows, where)
        if (orderBy?.playedAt === 'desc') {
          list = list.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
        }
        return list[0] ?? null
      },
      findUnique: async ({
        where,
      }: {
        where: { uid_gameId: { uid: string; gameId: string } }
        select?: { id: true }
      }) => {
        const key = `${where.uid_gameId.uid}:${where.uid_gameId.gameId}`
        const row = rows.get(key)
        return row ? { id: row.id } : null
      },
    },
    playerProfileRefreshState: {
      findUnique: async () => ({
        manualRefreshedAt: new Date(),
        lastCheckedAt: new Date(),
        lastFailedAt: null,
        nextRetryAt: null,
      }),
      upsert: async () => ({}),
    },
    matchesCache: {
      delete: async () => ({}),
    },
  }
}

function seedPlayerMatchRow(
  rows: Map<string, PlayerMatchRow>,
  uid: string,
  gameId: string,
  options: {
    gameMode?: string
    playedAt?: Date
    rpAfter?: number
    rpDelta?: number
    accountLevel?: number
    characterLevel?: number
    skinCode?: number
    bestWeapon?: number
    tacticalSkillGroup?: number
    traitFirstCore?: number
    traitFirstSub?: unknown
    traitSecondSub?: unknown
    equipment?: unknown
    equipmentGrade?: unknown
    routeIdOfStart?: number
    routeSlotId?: number
    gameDuration?: number
    cobaltInfusions?: number[]
    /** true면 loadout 없는 legacy stripped row */
    stripped?: boolean
  } = {},
): void {
  const stripped = options.stripped ?? false
  rows.set(`${uid}:${gameId}`, {
    id: BigInt(rows.size + 1),
    uid,
    gameId,
    gameMode: options.gameMode ?? 'rank',
    apiSeasonId: 20,
    displaySeasonId: 11,
    playedAt: options.playedAt ?? new Date('2026-06-01T00:00:00Z'),
    characterNum: 1,
    characterName: '유키',
    placement: 1,
    kills: 1,
    deaths: 0,
    assists: 0,
    teamKills: 8,
    damageToPlayer: 12000,
    victory: true,
    rpAfter: options.rpAfter ?? 2400,
    rpDelta: options.rpDelta ?? 10,
    gameDuration: options.gameDuration ?? (stripped ? null : 1234),
    cobaltInfusions: options.cobaltInfusions ?? null,
    accountLevel: options.accountLevel ?? (stripped ? null : 510),
    characterLevel: options.characterLevel ?? (stripped ? null : 20),
    skinCode: options.skinCode ?? null,
    bestWeapon: options.bestWeapon ?? (stripped ? null : 20),
    tacticalSkillGroup: options.tacticalSkillGroup ?? (stripped ? null : 120),
    traitFirstCore: options.traitFirstCore ?? (stripped ? null : 7_100_101),
    traitFirstSub: options.traitFirstSub ?? (stripped ? null : [7_110_701]),
    traitSecondSub: options.traitSecondSub ?? (stripped ? null : [7_310_201]),
    equipment: options.equipment ?? (stripped ? null : { '0': 119_503 }),
    equipmentGrade: options.equipmentGrade ?? (stripped ? null : { '0': 5 }),
    routeIdOfStart: options.routeIdOfStart ?? (stripped ? null : 7143),
    routeSlotId: options.routeSlotId ?? (stripped ? null : 0),
  })
}

function mockBserGamesPages(totalGames: number, pageSize = BSER_GAMES_PAGE_SIZE) {
  bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
    const startIndex = cursor ?? 0
    if (startIndex >= totalGames) {
      return { games: [], next: undefined }
    }
    const count = Math.min(pageSize, totalGames - startIndex)
    const games = Array.from({ length: count }, (_, index) => makeBserGame(startIndex + index + 1))
    const nextIndex = startIndex + count
    return {
      games,
      next: nextIndex < totalGames ? nextIndex : undefined,
    }
  })
}

async function drainSeasonAggregateBackgroundJobs(
  uid: string,
  apiSeasonId: number,
  timeoutMs = 15_000,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25))
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isSeasonAggregateRefreshInFlight(uid, apiSeasonId)) {
      await new Promise((resolve) => setTimeout(resolve, 15))
      if (!isSeasonAggregateRefreshInFlight(uid, apiSeasonId)) {
        return
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`season aggregate background jobs did not finish within ${timeoutMs}ms`)
}

function readySeasonAggregate(overrides: Record<string, unknown> = {}) {
  return {
    userNum: 123456,
    seasonId: 11,
    apiSeasonId: 20,
    cacheStatus: 'ready',
    characterStats: [
      {
        characterNum: 1,
        characterName: '유키',
        games: 5,
        wins: 2,
        winRate: 40,
        avgRank: 3,
        kills: 10,
        assists: 15,
        deaths: 5,
        kda: 5,
        avgTeamKills: 7,
        avgKills: 2,
        avgDamage: 12000,
        gradeLabel: null,
      },
    ],
    rpSeries: Array.from({ length: 7 }, (_, index) => ({
      matchId: String(index + 1),
      dateLabel: `6. ${index + 1}.`,
      rpAfter: 2400 + index * 50,
    })),
    lastRefreshedAt: '2026-06-13T00:00:00.000Z',
    ...overrides,
  } as const
}

describe('players routes (BSER mock)', () => {
  let app: FastifyInstance
  let playerMatchRows: Map<string, PlayerMatchRow>

  beforeEach(async () => {
    vi.clearAllMocks()
    clearSeasonAggregateRefreshQueueForTests()
    clearFullBackfillStateForTests()
    resetRecentMatchFreshnessInflightForTests()
    process.env.BSER_API_KEY = 'test-key'
    process.env.NODE_ENV = 'test'
    playerMatchRows = new Map()

    bserMock.getUserByNickname.mockResolvedValue(testUser)
    bserMock.getUserRank.mockResolvedValue({ mmr: 2400, nickname: 'TestPlayer', rank: 100 })
    bserMock.getUserStats.mockResolvedValue([])
    bserMock.getUserGames.mockResolvedValue({
      games: [
        {
          gameId: 1,
          accountLevel: 120,
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 1,
          gameRank: 1,
          playerKill: 1,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
        },
      ],
      next: undefined,
    })
    bserMock.getCharacterNames.mockResolvedValue(new Map([[1, '유키']]))

    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue(null)
    seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockImplementation((...args: unknown[]) =>
      seasonStatsCacheMock.readSeasonStatsCache(...args),
    )
    seasonStatsCacheMock.writeSeasonStatsCache.mockResolvedValue(undefined)
    matchesCacheMock.readMatchesCache.mockResolvedValue(null)
    matchesCacheMock.readMatchesCacheSnapshot.mockImplementation((...args: unknown[]) =>
      matchesCacheMock.readMatchesCache(...args),
    )
    matchesCacheMock.writeMatchesCache.mockResolvedValue(undefined)
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(null)
    seasonAggregateCacheMock.writeSeasonAggregateCache.mockResolvedValue(undefined)

    app = await createApp({
      prisma: createPlayerMatchPrisma(playerMatchRows) as never,
    })
    await app.ready()
  })

  it('/players/search — getUserGames를 호출하지 않음', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players/search?q=TestPlayer' })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(bserMock.getUserByNickname).toHaveBeenCalled()
    expect(bserMock.getUserRank).toHaveBeenCalled()
  })

  it('/players/:nickname/summary — 기본적으로 getUserGames를 호출하지 않음', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players/TestPlayer/summary' })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/matches — 기본 조회는 getUserGames를 호출하지 않음', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/seasons — 요청 범위만 조회', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/seasons?from=10&to=10',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserStats).toHaveBeenCalledTimes(1)
  })

  it('빈 stats도 seasonStatsCache write 대상', async () => {
    await app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats' })
    expect(seasonStatsCacheMock.writeSeasonStatsCache).toHaveBeenCalled()
    const statsArg = seasonStatsCacheMock.writeSeasonStatsCache.mock.calls[0]?.[2]
    expect(statsArg).toEqual([])
    const isCurrent = seasonStatsCacheMock.writeSeasonStatsCache.mock.calls[0]?.[3]
    expect(isCurrent).toBe(true)
  })

  it('/players/:nickname/stats — seasonId 쿼리는 UI 표시 시즌에서 API seasonID로 변환', async () => {
    await app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats?seasonId=11' })

    expect(bserMock.getUserStats).toHaveBeenCalledWith('uid-test-player', 20)
    expect(seasonStatsCacheMock.writeSeasonStatsCache).toHaveBeenCalledWith(
      expect.anything(),
      'uid-test-player:20',
      expect.anything(),
      true,
    )
  })

  it('/players/:nickname/matches — page/pageSize 쿼리 처리', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=1&pageSize=10',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { page: number; pageSize: number } }
    expect(body.data.page).toBe(1)
    expect(body.data.pageSize).toBe(10)
  })

  it('/players/:nickname/matches — pageSize 상한 초과 시 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=100',
    })
    expect(res.statusCode).toBe(400)
  })

  it('/players/:nickname/matches — page0 50건, BSER 10건/회 → 5회 호출·hasNext true', async () => {
    mockBserGamesPages(55)
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=50&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalledTimes(5)
    const body = res.json() as {
      data: { items: unknown[]; hasNext: boolean; page: number; pageSize: number }
    }
    expect(body.data.items).toHaveLength(50)
    expect(body.data.hasNext).toBe(true)
    expect(body.data.page).toBe(0)
    expect(body.data.pageSize).toBe(50)
  })

  it('/players/:nickname/matches — 정확히 50건이면 hasNext false', async () => {
    mockBserGamesPages(50)
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=50&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalledTimes(5)
    const body = res.json() as { data: { items: unknown[]; hasNext: boolean } }
    expect(body.data.items).toHaveLength(50)
    expect(body.data.hasNext).toBe(false)
  })

  it('/players/:nickname/matches — 50건 미만이면 남은 건수만 반환·hasNext false', async () => {
    mockBserGamesPages(48)
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=50&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalledTimes(5)
    const body = res.json() as { data: { items: unknown[]; hasNext: boolean } }
    expect(body.data.items).toHaveLength(48)
    expect(body.data.hasNext).toBe(false)
  })

  it('/players/:nickname/matches — page1은 누적 20건까지 수집', async () => {
    mockBserGamesPages(55)
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=1&pageSize=10&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalledTimes(2)
    const body = res.json() as { data: { items: unknown[]; hasNext: boolean; page: number } }
    expect(body.data.items).toHaveLength(10)
    expect(body.data.hasNext).toBe(true)
    expect(body.data.page).toBe(1)
  })

  it('/players/:nickname/matches — DB 캐시 hit 시 getUserGames 미호출', async () => {
    const games = Array.from({ length: 55 }, (_, index) => makeBserGame(index + 1))
    matchesCacheMock.readMatchesCache.mockResolvedValue({
      items: games.map((game, index) => ({
        matchId: String(game.gameId),
        userNum: uidToUserNum(testUser.uid),
        characterNum: 1,
        characterName: '유키',
        placement: 1,
        kills: 1,
        deaths: 0,
        assists: 0,
        gameStartedAt: `2026-06-01T00:00:0${index}.000Z`,
        victory: true,
      })),
      next: 99,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=50&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalled()
    const body = res.json() as { data: { items: unknown[]; hasNext: boolean } }
    expect(body.data.items).toHaveLength(1)
    expect(body.data.hasNext).toBe(false)
  })

  it('/players/:nickname/matches — BSER 조회 후 DB 캐시 write', async () => {
    mockBserGamesPages(20)
    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&refresh=true',
    })
    expect(matchesCacheMock.writeMatchesCache).toHaveBeenCalled()
  })

  it('과거 시즌 empty stats — isCurrent false로 저장', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/seasons?from=1&to=1',
    })
    expect(seasonStatsCacheMock.writeSeasonStatsCache).toHaveBeenCalled()
    const wrotePast = seasonStatsCacheMock.writeSeasonStatsCache.mock.calls.some(
      (call) => call[3] === false,
    )
    expect(wrotePast).toBe(true)
  })

  it('concurrent resolveUser — getUserByNickname 1회', async () => {
    bserMock.getUserByNickname.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return testUser
    })
    await Promise.all([
      app.inject({ method: 'GET', url: '/api/players/TestPlayer/summary' }),
      app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats' }),
      app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10',
      }),
    ])
    expect(bserMock.getUserByNickname).toHaveBeenCalledTimes(1)
  })

  it('concurrent getRankCached — getUserRank 1회', async () => {
    bserMock.getUserRank.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return { mmr: 2400, nickname: 'TestPlayer', rank: 100 }
    })
    await Promise.all([
      app.inject({ method: 'GET', url: '/api/players/TestPlayer/summary' }),
      app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats' }),
    ])
    expect(bserMock.getUserRank).toHaveBeenCalledTimes(1)
  })

  it('/players/:nickname/matches — pageSize=10이면 hasNext 판정을 위해 20건까지 확인', async () => {
    mockBserGamesPages(55)
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalledTimes(2)
    const body = res.json() as { data: { items: unknown[]; hasNext: boolean } }
    expect(body.data.items).toHaveLength(10)
    expect(body.data.hasNext).toBe(true)
  })

  it('/players/:nickname/matches — pageSize=20이면 getUserGames 2회', async () => {
    mockBserGamesPages(55)
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=20&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalledTimes(2)
    const body = res.json() as { data: { items: unknown[] } }
    expect(body.data.items).toHaveLength(20)
  })

  it('/players/:nickname/matches — characterNames cold 시 fallback으로 응답', async () => {
    bserMock.getCharacterNames.mockImplementation(
      () => new Promise(() => {}),
    )
    const started = Date.now()
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&refresh=true',
    })
    expect(res.statusCode).toBe(200)
    expect(Date.now() - started).toBeLessThan(200)
    const body = res.json() as {
      data: { items: Array<{ characterName: string; characterNum: number }> }
    }
    expect(body.data.items[0]?.characterName).toBe('실험체 #1')
  })

  it('/players/:nickname/matches — DB 캐시 10경기 저장 후 page=0 즉시 반환', async () => {
    mockBserGamesPages(30)
    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&refresh=true',
    })
    const writeArg = matchesCacheMock.writeMatchesCache.mock.calls[0]?.[2]
    expect(writeArg?.items).toHaveLength(20)

    const cachedItems = writeArg?.items ?? []
    matchesCacheMock.readMatchesCache.mockResolvedValue({
      items: cachedItems,
      next: 10,
    })
    bserMock.getUserGames.mockClear()

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10',
    })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/matches — 추가 page 요청 시 누적 cache 확장', async () => {
    mockBserGamesPages(30)
    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&refresh=true',
    })
    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=1&pageSize=10&refresh=true',
    })
    const lastWrite = matchesCacheMock.writeMatchesCache.mock.calls.at(-1)?.[2]
    expect(lastWrite?.items.length).toBeGreaterThanOrEqual(20)
  })

  it('/players/:nickname/season-aggregate — ready aggregate cache를 반환', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(readySeasonAggregate())

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      source: string
      data: {
        cacheStatus: string
        source: string
        basisLabel: string
        characterStats: unknown[]
        rpSeries: unknown[]
      }
    }
    expect(body.source).toBe('cache')
    expect(body.data.cacheStatus).toBe('ready')
    expect(body.data.source).toBe('cache')
    expect(body.data.basisLabel).toBe('수집된 랭크 경기 기준')
    expect(body.data.characterStats).toHaveLength(1)
    expect(body.data.rpSeries).toHaveLength(7)
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).not.toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(bserMock.getUserStats).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — PlayerMatch complete이면 partial cache라도 즉시 반환', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 10,
        totalWins: 4,
        totalTeamKills: 100,
        totalDeaths: 20,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [],
      },
    ])
    for (let gameId = 1; gameId <= 10; gameId += 1) {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, String(gameId))
    }
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({ cacheStatus: 'partial' }),
    )

    const started = Date.now()
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })
    expect(Date.now() - started).toBeLessThan(2_000)

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: {
        isRefreshing: boolean
        backfillProgress?: { status: string }
      }
    }
    expect(body.data.isRefreshing).toBe(false)
    expect(body.data.backfillProgress?.status).toBe('complete')
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — 구버전 12포인트 ready 캐시는 최신 7일로 재빌드', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({
        rpSeries: Array.from({ length: 12 }, (_, index) => ({
          matchId: `old-${index + 1}`,
          dateLabel: `6. ${index + 1}.`,
          rpAfter: 2400 + index * 10,
        })),
      }),
    )
    matchesCacheMock.readMatchesCache.mockResolvedValue({
      items: Array.from({ length: 12 }, (_, index) => ({
        matchId: `rank-day-${index + 1}`,
        userNum: 123456,
        characterNum: 1,
        characterName: '유키',
        placement: 1,
        kills: 3,
        deaths: 1,
        assists: 2,
        teamKills: 8,
        damageToPlayers: 12000,
        gameStartedAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        victory: true,
        seasonNumber: 11,
        gameMode: 'rank',
        rpAfter: 2400 + index * 10,
      })),
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { rpSeries: Array<{ dateLabel: string; rpAfter: number }> } }
    expect(body.data.rpSeries).toHaveLength(7)
    expect(body.data.rpSeries.map((point) => point.rpAfter)).toEqual([
      2450,
      2460,
      2470,
      2480,
      2490,
      2500,
      2510,
    ])
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — seasonId 쿼리는 UI 표시 시즌에서 API seasonID로 변환', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(readySeasonAggregate())

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
    })

    expect(res.statusCode).toBe(200)
    expect(seasonAggregateCacheMock.readSeasonAggregateCache).toHaveBeenCalledWith(
      expect.anything(),
      'uid-test-player:20',
    )
    expect(seasonStatsCacheMock.readSeasonStatsCacheSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      'uid-test-player:20',
    )
    expect(matchesCacheMock.readMatchesCacheSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      'uid-test-player:rank',
    )
    expect(matchesCacheMock.readMatchesCacheSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      'uid-test-player:0',
    )
  })

  it('/players/:nickname/season-aggregate — ready cache 없으면 기존 caches 기반으로 build/write 후 반환', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 2,
        totalWins: 2,
        totalTeamKills: 30,
        totalDeaths: 5,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [
          {
            characterCode: 1,
            totalGames: 2,
            wins: 2,
            averageRank: 3,
          },
        ],
      },
    ])
    for (let gameId = 1; gameId <= 2; gameId += 1) {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, String(gameId), {
        gameMode: 'rank',
        playedAt: new Date(`2026-06-${String(gameId).padStart(2, '0')}T00:00:00Z`),
        rpAfter: 2400 + gameId * 10,
      })
    }
    matchesCacheMock.readMatchesCache.mockResolvedValue({
      items: [
        {
          matchId: '1',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 2,
          kills: 2,
          deaths: 1,
          assists: 3,
          gameStartedAt: '2026-06-01T00:00:00.000Z',
          victory: false,
          seasonNumber: 11,
          gameMode: 'rank',
          rpAfter: 2400,
        },
        {
          matchId: '2',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 1,
          kills: 3,
          deaths: 0,
          assists: 4,
          gameStartedAt: '2026-06-02T00:00:00.000Z',
          victory: true,
          seasonNumber: 11,
          gameMode: 'rank',
          rpAfter: 2450,
        },
      ],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: {
        cacheStatus: string
        source: string
        basisLabel: string
        characterStats: unknown[]
        rpSeries: unknown[]
      }
    }
    expect(body.data.cacheStatus).toBe('ready')
    expect(body.data.source).toBe('mixed')
    expect(body.data.basisLabel).toBe('시즌 전체 랭크 경기 기준')
    expect(body.data.characterStats).toHaveLength(1)
    expect(body.data.rpSeries).toHaveLength(2)
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(bserMock.getUserStats).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — 빈 partial cache는 기존 caches 기반으로 재계산해 더 풍부한 결과를 반환', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({
        cacheStatus: 'partial',
        characterStats: [],
        rpSeries: [],
      }),
    )
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 2,
        totalWins: 1,
        totalTeamKills: 12,
        totalDeaths: 1,
        averageRank: 2,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.5,
        top3: 1,
        characterStats: [
          {
            characterCode: 1,
            totalGames: 2,
            wins: 1,
            averageRank: 2,
          },
        ],
      },
    ])
    for (let gameId = 1; gameId <= 2; gameId += 1) {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, String(gameId), {
        gameMode: 'rank',
        playedAt: new Date(`2026-06-${String(gameId).padStart(2, '0')}T00:00:00Z`),
        rpAfter: 2400 + gameId * 10,
      })
    }
    matchesCacheMock.readMatchesCache.mockResolvedValue({
      items: [
        {
          matchId: '1',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 2,
          kills: 2,
          deaths: 1,
          assists: 3,
          gameStartedAt: '2026-06-01T00:00:00.000Z',
          victory: false,
          seasonNumber: 11,
          gameMode: 'rank',
          rpAfter: 2400,
        },
        {
          matchId: '2',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 1,
          kills: 3,
          deaths: 0,
          assists: 4,
          gameStartedAt: '2026-06-02T00:00:00.000Z',
          victory: true,
          seasonNumber: 11,
          gameMode: 'rank',
          rpAfter: 2450,
        },
      ],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: {
        characterStats: unknown[]
        rpSeries: unknown[]
        coverage?: { collectedGames: number | null; officialSeasonGames: number | null }
      }
    }
    expect(body.data.characterStats).toHaveLength(1)
    expect(body.data.rpSeries.length).toBeGreaterThanOrEqual(2)
    expect(body.data.coverage).toMatchObject({
      collectedGames: 2,
      officialSeasonGames: 2,
    })
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(bserMock.getUserStats).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — ready cache는 stats cache가 있어도 즉시 반환', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({
        source: 'matchCache',
        characterStats: [
          {
            characterNum: 1,
            characterName: '유키',
            games: 2,
            wins: 1,
            winRate: 50,
            avgRank: 2,
            kills: 8,
            assists: 4,
            deaths: 2,
            kda: 6,
            avgTeamKills: 8,
            avgKills: 4,
            avgDamage: 15000,
            gradeLabel: null,
          },
        ],
      }),
    )
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 19,
        totalWins: 7,
        totalTeamKills: 120,
        totalDeaths: 20,
        averageRank: 2,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.37,
        top3: 0.84,
        characterStats: [
          {
            characterCode: 1,
            totalGames: 19,
            wins: 7,
            averageRank: 2,
          },
        ],
      },
    ])
    matchesCacheMock.readMatchesCache.mockResolvedValue({
      items: [
        {
          matchId: '1',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 1,
          kills: 4,
          deaths: 1,
          assists: 3,
          teamKills: 8,
          damageToPlayers: 15000,
          gameStartedAt: '2026-06-01T00:00:00.000Z',
          victory: true,
          seasonNumber: 11,
          gameMode: 'rank',
          rpAfter: 2400,
        },
        {
          matchId: '2',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 2,
          kills: 4,
          deaths: 1,
          assists: 1,
          teamKills: 8,
          damageToPlayers: 15000,
          gameStartedAt: '2026-06-02T00:00:00.000Z',
          victory: false,
          seasonNumber: 11,
          gameMode: 'rank',
          rpAfter: 2450,
        },
      ],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: { source: string; characterStats: Array<{ games: number; kda: number | null }> }
    }
    expect(body.data.source).toBe('matchCache')
    expect(body.data.characterStats[0]).toMatchObject({ games: 2, kda: 6 })
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).not.toHaveBeenCalled()
    expect(bserMock.getUserStats).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — caches 부족하면 partial 반환', async () => {
    bserMock.getUserGames.mockResolvedValue({ games: [], next: undefined })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: { cacheStatus: string; isRefreshing: boolean; characterStats: unknown[]; rpSeries: unknown[] }
    }
    expect(body.data.cacheStatus).toBe('partial')
    expect(body.data.isRefreshing).toBe(true)
    expect(body.data.characterStats).toEqual([])
    expect(body.data.rpSeries).toEqual([])
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(bserMock.getUserStats).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — partial이면 즉시 snapshot 반환 후 async full backfill', async () => {
    let cachedMatches: { items: unknown[]; next?: number } | null = null
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 12,
        totalWins: 4,
        totalTeamKills: 100,
        totalDeaths: 20,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [
          {
            characterCode: 1,
            totalGames: 12,
            wins: 4,
            averageRank: 3,
          },
        ],
      },
    ])
    matchesCacheMock.readMatchesCache.mockImplementation(async () => cachedMatches)
    matchesCacheMock.writeMatchesCache.mockImplementation(async (_prisma, _id, payload) => {
      cachedMatches = payload
    })
    bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
      const startIndex = cursor ?? 0
      if (startIndex >= 70) return { games: [], next: undefined }
      const games = Array.from({ length: 10 }, (_, index) => {
        const day = Math.floor((startIndex + index) / 5) + 1
        return {
          ...makeBserGame(startIndex + index + 1),
          startDtm: `2026-06-${String(day).padStart(2, '0')}T00:00:00Z`,
          playerKill: 2 + day,
          playerAssistant: 3,
          playerDeaths: 1,
          teamKill: 10 + day,
          damageToPlayer: 10000 + day * 100,
          rpAfter: 2400 + day * 10,
          rpDelta: 10,
        }
      })
      const next = startIndex + 10
      return { games, next: next < 70 ? next : undefined }
    })

    const started = Date.now()
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })
    expect(Date.now() - started).toBeLessThan(5_000)

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: {
        cacheStatus: string
        isRefreshing: boolean
        characterStats: Array<{
          characterName?: string
          kda: number | null
          avgTeamKills: number | null
          avgKills: number | null
          avgDamage: number | null
        }>
        rpSeries: unknown[]
      }
    }
    expect(body.data.cacheStatus).toBe('partial')
    expect(body.data.isRefreshing).toBe(true)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()

    await drainSeasonAggregateBackgroundJobs(testUser.uid, 20)

    expect(bserMock.getUserGames).toHaveBeenCalled()
    expect(bserMock.getUserGames.mock.calls.length).toBeLessThanOrEqual(7)
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — refresh 실패해도 route는 partial 응답을 유지', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 12,
        totalWins: 4,
        totalTeamKills: 100,
        totalDeaths: 20,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [],
      },
    ])
    bserMock.getUserGames.mockRejectedValue(new Error('upstream boom'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: { cacheStatus: string; isRefreshing: boolean; characterStats: unknown[]; rpSeries: unknown[] }
    }
    expect(body.data.cacheStatus).toBe('partial')
    expect(body.data.isRefreshing).toBe(true)
    expect(body.data.characterStats).toEqual([])
    expect(body.data.rpSeries).toEqual([])
    expect(bserMock.getUserGames).not.toHaveBeenCalled()

    await drainSeasonAggregateBackgroundJobs(testUser.uid, 20)
    expect(bserMock.getUserGames).toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — 같은 uid+season full backfill은 dedupe', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 30,
        totalWins: 10,
        totalTeamKills: 100,
        totalDeaths: 20,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [],
      },
    ])
    let releaseGate!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    bserMock.getUserGames.mockImplementation(async () => {
      await gate
      return { games: [makeBserGame(1)], next: undefined }
    })

    const firstPromise = app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })
    const secondPromise = app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    await vi.waitFor(() => expect(bserMock.getUserGames).toHaveBeenCalledTimes(1))
    releaseGate()

    const [first, second] = await Promise.all([firstPromise, secondPromise])
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(bserMock.getUserGames).toHaveBeenCalledTimes(1)
  })

  it('/players/:nickname/season-aggregate — partial cache는 응답 후 background refresh 예약', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({ cacheStatus: 'partial', rpSeries: [] }),
    )
    bserMock.getUserGames.mockResolvedValue({ games: [], next: undefined })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { cacheStatus: string; isRefreshing: boolean } }
    expect(body.data.cacheStatus).toBe('partial')
    expect(body.data.isRefreshing).toBe(true)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — coverage가 충분한 partial은 추가 refresh를 skip', async () => {
    bserMock.getUserGames.mockClear()
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 2,
        totalWins: 1,
        totalTeamKills: 12,
        totalDeaths: 2,
        averageRank: 2,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.5,
        top3: 1,
        characterStats: [
          {
            characterCode: 1,
            totalGames: 2,
            wins: 1,
            averageRank: 2,
          },
        ],
      },
    ])
    for (let gameId = 1; gameId <= 2; gameId += 1) {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, String(gameId), {
        gameMode: 'rank',
        playedAt: new Date(`2026-06-${String(gameId).padStart(2, '0')}T00:00:00Z`),
        rpAfter: 2400 + gameId * 10,
      })
    }
    matchesCacheMock.readMatchesCache.mockResolvedValue({
      items: [
        {
          matchId: '1',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 1,
          kills: 2,
          deaths: 1,
          assists: 3,
          gameStartedAt: '2026-06-01T00:00:00.000Z',
          victory: true,
          seasonNumber: 11,
          gameMode: 'rank',
        },
        {
          matchId: '2',
          userNum: 123456,
          characterNum: 1,
          characterName: '유키',
          placement: 3,
          kills: 2,
          deaths: 1,
          assists: 3,
          gameStartedAt: '2026-06-02T00:00:00.000Z',
          victory: false,
          seasonNumber: 11,
          gameMode: 'rank',
        },
      ],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: {
        cacheStatus: string
        coverage?: { officialSeasonGames: number | null; collectedGames: number | null }
      }
    }
    expect(body.data.cacheStatus).toBe('ready')
    expect(body.data.coverage).toMatchObject({
      officialSeasonGames: 2,
      collectedGames: 2,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — ready cache는 refresh enqueue하지 않음', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(readySeasonAggregate())

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { cacheStatus: string } }
    expect(body.data.cacheStatus).toBe('ready')
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — background refresh는 pageSize=10 정책을 유지', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 30,
        totalWins: 10,
        totalTeamKills: 100,
        totalDeaths: 20,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [],
      },
    ])
    let cachedMatches: { items: unknown[]; next?: number } | null = null
    let cachedMatchCount = 0
    matchesCacheMock.readMatchesCache.mockImplementation(async () => cachedMatches)
    matchesCacheMock.writeMatchesCache.mockImplementation(async (_prisma, _id, payload) => {
      cachedMatches = payload
      cachedMatchCount = payload.items.length
    })
    bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
      const startIndex = cursor ?? 0
      const games = Array.from({ length: 10 }, (_, index) => makeBserGame(startIndex + index + 1))
      return { games, next: startIndex + 10 }
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()

    await drainSeasonAggregateBackgroundJobs(testUser.uid, 20)

    expect(bserMock.getUserGames).toHaveBeenCalled()
    expect(bserMock.getUserGames.mock.calls.length).toBeLessThanOrEqual(8)
    expect(cachedMatchCount).toBeLessThanOrEqual(50)
  })

  it('/players/:nickname/season-aggregate — full backfill는 검색 유저만 수집', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 10,
        totalWins: 4,
        totalTeamKills: 100,
        totalDeaths: 20,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [],
      },
    ])
    mockBserGamesPages(10)

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()

    await drainSeasonAggregateBackgroundJobs(testUser.uid, 20)

    expect(bserMock.getUserGames).toHaveBeenCalled()
    expect(bserMock.getUserGames.mock.calls.every(([uid]) => uid === 'uid-test-player')).toBe(true)
  })

  it('/players/:nickname/season-aggregate — warming cache도 먼저 반환하고 refresh 예약', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({ cacheStatus: 'warming' }),
    )

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { cacheStatus: string; isRefreshing: boolean } }
    expect(body.data.cacheStatus).toBe('warming')
    expect(body.data.isRefreshing).toBe(true)
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).not.toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('concurrent resolveSeasonCatalog — loadSeasonCatalog 1회', async () => {
    const catalogMock = vi.mocked(loadSeasonCatalog)
    catalogMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return mockSeasonCatalog as never
    })
    await Promise.all([
      app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats' }),
      app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/seasons?from=10&to=10',
      }),
    ])
    expect(catalogMock).toHaveBeenCalledTimes(1)
  })

  it('응답·로그에 API key 미포함', async () => {
    process.env.BSER_API_KEY = 'super-secret-test-key-xyz'
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/summary',
    })
    const text = res.body
    expect(text).not.toContain('super-secret-test-key-xyz')
    expect(text).not.toContain('x-api-key')
  })

  it('userNum query — mismatch여도 nickname uidCache fallback 200', async () => {
    const userA = { uid: 'uid-a', nickname: 'TestPlayer' }
    bserMock.getUserByNickname.mockResolvedValueOnce(userA)
    await app.inject({ method: 'GET', url: '/api/players/TestPlayer/summary' })

    const wrongUserNum = 999999999
    const res = await app.inject({
      method: 'GET',
      url: `/api/players/TestPlayer/summary?userNum=${wrongUserNum}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.userNum).toBe(uidToUserNum(userA.uid))
  })

  it('userNum query — summary/stats/matches nickname fallback 200', async () => {
    const user = { uid: 'uid-stable', nickname: 'TestPlayer' }
    bserMock.getUserByNickname.mockResolvedValue(user)
    mockBserGamesPages(12)
    const wrongUserNum = 111111111

    const [summaryRes, statsRes, matchesRes] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/players/TestPlayer/summary?userNum=${wrongUserNum}`,
      }),
      app.inject({
        method: 'GET',
        url: `/api/players/TestPlayer/stats?userNum=${wrongUserNum}`,
      }),
      app.inject({
        method: 'GET',
        url: `/api/players/TestPlayer/matches?page=0&pageSize=10&userNum=${wrongUserNum}&refresh=true`,
      }),
    ])

    expect(summaryRes.statusCode).toBe(200)
    expect(statsRes.statusCode).toBe(200)
    expect(matchesRes.statusCode).toBe(200)
    expect(summaryRes.json().data.userNum).toBe(uidToUserNum(user.uid))
    expect(statsRes.json().data.userNum).toBe(uidToUserNum(user.uid))
    expect(matchesRes.json().data.items[0]?.userNum).toBe(uidToUserNum(user.uid))
  })

  describe('stats owner contract', () => {
    const squadStats = [
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 30,
        totalWins: 10,
        totalTeamKills: 30,
        totalDeaths: 5,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [],
      },
    ]

    it('summary와 stats가 동일 userNum을 반환한다', async () => {
      bserMock.getUserByNickname.mockResolvedValue(testUser)
      bserMock.getUserStats.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockResolvedValue(squadStats)

      const [summaryRes, statsRes] = await Promise.all([
        app.inject({ method: 'GET', url: '/api/players/TestPlayer/summary' }),
        app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats' }),
      ])

      const summaryUserNum = summaryRes.json().data.userNum as number
      const statsBody = statsRes.json().data as {
        userNum: number
        playerMatchCharacterStatsMeta?: { userNum: number; status: string; rowCount: number }
      }
      expect(statsBody.userNum).toBe(summaryUserNum)
      expect(statsBody.playerMatchCharacterStatsMeta?.userNum).toBe(summaryUserNum)
    })

    it('rich PlayerMatch stats — owner·meta·rowCount complete', async () => {
      bserMock.getUserByNickname.mockResolvedValue(testUser)
      bserMock.getUserStats.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockResolvedValue(squadStats)

      for (let index = 1; index <= 2; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, `owner-rich-${index}`)
      }

      const res = await app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats' })
      const body = res.json().data as {
        userNum: number
        playerMatchCharacterStats?: unknown[]
        playerMatchCharacterStatsMeta?: { status: string; rowCount: number; userNum: number }
      }
      expect(body.userNum).toBe(uidToUserNum(testUser.uid))
      expect(body.playerMatchCharacterStatsMeta).toMatchObject({
        status: 'complete',
        userNum: body.userNum,
        rowCount: body.playerMatchCharacterStats?.length,
      })
      expect(body.playerMatchCharacterStats?.length).toBeGreaterThan(0)
    })

    it('PlayerMatch empty — complete owner와 rowCount 0', async () => {
      bserMock.getUserByNickname.mockResolvedValue(testUser)
      bserMock.getUserStats.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockResolvedValue(squadStats)

      const res = await app.inject({ method: 'GET', url: '/api/players/TestPlayer/stats' })
      const body = res.json().data as {
        userNum: number
        playerMatchCharacterStatsMeta?: { status: string; rowCount: number; userNum: number }
      }
      expect(body.userNum).toBe(uidToUserNum(testUser.uid))
      expect(body.playerMatchCharacterStatsMeta).toMatchObject({
        status: 'complete',
        rowCount: 0,
        userNum: body.userNum,
      })
    })
  })

  it('uid query — nickname cache 없이 explicit uid 사용', async () => {
    const user = { uid: 'uid-explicit', nickname: 'TestPlayer' }
    bserMock.getUserByNickname.mockResolvedValueOnce(testUser)
    await app.inject({ method: 'GET', url: '/api/players/TestPlayer/summary' })

    const res = await app.inject({
      method: 'GET',
      url: `/api/players/TestPlayer/summary?uid=${user.uid}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.userNum).toBe(uidToUserNum(user.uid))
    expect(bserMock.getUserByNickname).toHaveBeenCalledTimes(1)
  })

  it('matches mode=rank — rank 경기만 반환', async () => {
    bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
      const startIndex = cursor ?? 0
      if (startIndex >= 20) return { games: [], next: undefined }
      const games = Array.from({ length: 10 }, (_, index) => {
        const gameId = startIndex + index + 1
        return {
          ...makeBserGame(gameId),
          matchingMode: index % 2 === 0 ? 3 : 6,
        }
      })
      return { games, next: startIndex + 10 < 20 ? startIndex + 10 : undefined }
    })

    const allRes = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=all&refresh=true',
    })
    expect(allRes.json().data.items).toHaveLength(10)

    const rankRes = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
    })
    const rankItems = rankRes.json().data.items as Array<{ gameMode?: string }>
    expect(rankItems.length).toBeGreaterThan(0)
    expect(rankItems.every((item) => item.gameMode === 'rank')).toBe(true)
    expect(rankItems.length).toBeLessThanOrEqual(10)
  })

  it('mode=normal은 normal만 반환한다', async () => {
    bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
      const startIndex = cursor ?? 0
      if (startIndex >= 10) return { games: [], next: undefined }
      const games = Array.from({ length: 10 }, (_, index) => ({
        ...makeBserGame(startIndex + index + 1),
        matchingMode: index % 2 === 0 ? 2 : 3,
      }))
      return { games, next: undefined }
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=normal&refresh=true',
    })

    const items = res.json().data.items as Array<{ gameMode?: string }>
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.gameMode === 'normal')).toBe(true)
  })

  it('mode=cobalt는 cobalt만 반환한다', async () => {
    bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
      const startIndex = cursor ?? 0
      if (startIndex >= 10) return { games: [], next: undefined }
      const games = Array.from({ length: 10 }, (_, index) => ({
        ...makeBserGame(startIndex + index + 1),
        matchingMode: index % 2 === 0 ? 6 : 3,
        finalInfusion: [7000201, 7000401, 7000501],
      }))
      return { games, next: undefined }
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=cobalt&refresh=true',
    })

    const items = res.json().data.items as Array<{ gameMode?: string; cobaltInfusions?: number[] }>
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.gameMode === 'cobalt')).toBe(true)
    expect(items[0]?.cobaltInfusions).toEqual([7000201, 7000401, 7000501])
  })

  it('mode=union — DB에 union row가 있으면 cobalt/normal과 분리 조회', async () => {
    for (let index = 1; index <= 10; index += 1) {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, `union-${index}`, {
        gameMode: 'union',
        playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
      })
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=union',
    })

    expect(res.statusCode).toBe(200)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    const items = res.json().data.items as Array<{ gameMode?: string }>
    expect(items).toHaveLength(10)
    expect(items.every((item) => item.gameMode === 'union')).toBe(true)
  })

  it('unknown matches mode는 schema validation error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=invalid',
    })
    expect(res.statusCode).toBe(400)
  })

  it('matches cobalt cache — uid:cobalt 키로 분리 저장', async () => {
    bserMock.getUserGames.mockImplementation(async () => ({
      games: [{ ...makeBserGame(1, 6), finalInfusion: [7000201] }],
      next: undefined,
    }))

    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=cobalt&refresh=true',
    })

    expect(matchesCacheMock.writeMatchesCache).toHaveBeenCalledWith(
      expect.anything(),
      `${testUser.uid}:cobalt`,
      expect.any(Object),
    )
  })

  it('matches rank cache — uid:rank 키로 분리 저장', async () => {
    bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
      const startIndex = cursor ?? 0
      if (startIndex >= 10) return { games: [], next: undefined }
      return {
        games: [makeBserGame(startIndex + 1, 3), makeBserGame(startIndex + 2, 6)],
        next: undefined,
      }
    })

    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
    })

    expect(matchesCacheMock.writeMatchesCache).toHaveBeenCalledWith(
      expect.anything(),
      `${testUser.uid}:rank`,
      expect.any(Object),
    )
  })

  it('/players/:nickname/season-aggregate — ready cache + uid:rank가 더 풍부하면 cache-only rebuild', async () => {
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({
        characterStats: [
          {
            characterNum: 1,
            characterName: '유키',
            games: 3,
            wins: 1,
            winRate: 33,
            avgRank: 3,
            kills: 6,
            assists: 9,
            deaths: 3,
            kda: 5,
            avgTeamKills: 7,
            avgKills: 2,
            avgDamage: 12000,
            gradeLabel: null,
          },
        ],
        rpSeries: [{ matchId: '1', dateLabel: '6. 1.', rpAfter: 2400 }],
        coverage: {
          officialSeasonGames: null,
          collectedGames: 3,
          characterCount: 1,
          rpPointCount: 1,
          coverageRatio: null,
        },
      }),
    )

    matchesCacheMock.readMatchesCacheSnapshot.mockImplementation(async (_prisma, id: string) => {
      if (id.endsWith(':rank')) {
        return {
          items: Array.from({ length: 10 }, (_, index) => ({
            matchId: `rank-${index + 1}`,
            userNum: 123456,
            characterNum: 1,
            characterName: '유키',
            placement: 1,
            kills: 3,
            deaths: 1,
            assists: 2,
            teamKills: 8,
            damageToPlayers: 12000,
            gameStartedAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            victory: true,
            seasonNumber: 11,
            gameMode: 'rank',
            rpAfter: 2400 + index * 10,
          })),
        }
      }
      if (id.endsWith(':0')) {
        return {
          items: [
            {
              matchId: 'normal-1',
              userNum: 123456,
              characterNum: 1,
              characterName: '유키',
              placement: 5,
              kills: 1,
              deaths: 3,
              assists: 1,
              gameStartedAt: '2026-06-12T00:00:00.000Z',
              victory: false,
              seasonNumber: 11,
              gameMode: 'normal',
            },
          ],
        }
      }
      return null
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: { rpSeries: unknown[]; coverage?: { collectedGames: number | null } }
    }
    expect(body.data.rpSeries.length).toBeGreaterThan(1)
    expect(body.data.coverage?.collectedGames).toBe(10)
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(bserMock.getUserStats).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — PlayerMatch rank 30 + cache rank 10이면 PlayerMatch 기준 collectedGames', async () => {
    for (let index = 0; index < 30; index += 1) {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, `pm-${index + 1}`, {
        playedAt: new Date(`2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:00:00+09:00`),
        rpAfter: 2400 + index * 10,
      })
    }
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(null)
    matchesCacheMock.readMatchesCacheSnapshot.mockImplementation(async (_prisma, id: string) => {
      if (id.endsWith(':rank')) {
        return {
          items: Array.from({ length: 10 }, (_, index) => ({
            matchId: `cache-${index + 1}`,
            userNum: uidToUserNum(testUser.uid),
            characterNum: 1,
            characterName: '유키',
            placement: 1,
            kills: 3,
            deaths: 1,
            assists: 2,
            teamKills: 8,
            damageToPlayers: 12000,
            gameStartedAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            victory: true,
            seasonNumber: 11,
            gameMode: 'rank',
            rpAfter: 2400 + index * 10,
          })),
        }
      }
      return null
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      data: {
        source?: string
        coverage?: { collectedGames: number | null }
        characterStats: Array<{ games: number }>
      }
    }
    expect(body.data.coverage?.collectedGames).toBe(30)
    expect(body.data.source).toBe('playerMatch')
    expect(body.data.characterStats.reduce((sum, row) => sum + row.games, 0)).toBe(30)
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — ready coverage=10 + PlayerMatch=30이면 DB-only rebuild', async () => {
    for (let index = 0; index < 30; index += 1) {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, `pm-${index + 1}`, {
        playedAt: new Date(`2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:00:00+09:00`),
        rpAfter: 2400 + index * 10,
      })
    }
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      readySeasonAggregate({
        coverage: {
          officialSeasonGames: null,
          collectedGames: 10,
          characterCount: 1,
          rpPointCount: 1,
          coverageRatio: null,
        },
      }),
    )
    matchesCacheMock.readMatchesCacheSnapshot.mockImplementation(async (_prisma, id: string) => {
      if (id.endsWith(':rank')) {
        return {
          items: Array.from({ length: 10 }, (_, index) => ({
            matchId: `cache-${index + 1}`,
            userNum: uidToUserNum(testUser.uid),
            characterNum: 1,
            characterName: '유키',
            placement: 1,
            kills: 3,
            deaths: 1,
            assists: 2,
            teamKills: 8,
            damageToPlayers: 12000,
            gameStartedAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            victory: true,
            seasonNumber: 11,
            gameMode: 'rank',
            rpAfter: 2400 + index * 10,
          })),
        }
      }
      return null
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { coverage?: { collectedGames: number | null } } }
    expect(body.data.coverage?.collectedGames).toBe(30)
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(bserMock.getUserStats).not.toHaveBeenCalled()
  })

  it('/players/:nickname/season-aggregate — async full backfill 후 PlayerMatch upsert가 aggregate rebuild에 반영', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 10,
        totalWins: 4,
        totalTeamKills: 100,
        totalDeaths: 20,
        averageRank: 3,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.2,
        top3: 0.6,
        characterStats: [],
      },
    ])
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(null)
    matchesCacheMock.readMatchesCache.mockResolvedValue(null)
    matchesCacheMock.readMatchesCacheSnapshot.mockResolvedValue(null)
    mockBserGamesPages(10)

    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
    })

    expect(playerMatchRows.size).toBe(0)

    await drainSeasonAggregateBackgroundJobs(testUser.uid, 20)

    expect(playerMatchRows.size).toBe(10)
    expect(seasonAggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()

    const writeArg = seasonAggregateCacheMock.writeSeasonAggregateCache.mock.calls.at(-1)?.[2] as
      | { coverage?: { collectedGames: number | null } }
      | undefined
    expect(writeArg?.coverage?.collectedGames).toBe(10)
  })

  it('/players/:nickname/season-aggregate — async full backfill는 PlayerMatch DB를 채운다', async () => {
    seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
      {
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 2400,
        nickname: 'TestPlayer',
        rank: 100,
        rankSize: 1000,
        totalGames: 2,
        totalWins: 1,
        totalTeamKills: 12,
        totalDeaths: 2,
        averageRank: 2,
        averageKills: 2,
        averageAssistants: 3,
        top1: 0.5,
        top3: 1,
        characterStats: [],
      },
    ])
    seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(null)
    matchesCacheMock.readMatchesCache.mockResolvedValue(null)
    matchesCacheMock.readMatchesCacheSnapshot.mockResolvedValue(null)
    bserMock.getUserGames.mockResolvedValue({
      games: [makeBserGame(1, 3), makeBserGame(2, 3)],
      next: undefined,
    })

    await app.inject({
      method: 'GET',
      url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
    })

    expect(bserMock.getUserGames).not.toHaveBeenCalled()
    expect(playerMatchRows.size).toBe(0)

    await drainSeasonAggregateBackgroundJobs(testUser.uid, 20)

    expect(bserMock.getUserGames).toHaveBeenCalled()
    expect(playerMatchRows.size).toBe(2)
  })

  describe('collectMatches PlayerMatch persistence', () => {
    it('BSER freshMatches를 PlayerMatch에 upsert한다', async () => {
      mockBserGamesPages(10)

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
      })

      expect(playerMatchRows.size).toBe(10)
      expect([...playerMatchRows.values()].every((row) => row.gameMode === 'rank')).toBe(true)
    })

    it('같은 match 재fetch해도 PlayerMatch 중복 row가 생기지 않는다', async () => {
      mockBserGamesPages(10)

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
      })
      expect(playerMatchRows.size).toBe(10)

      app = await createApp({
        prisma: createPlayerMatchPrisma(playerMatchRows) as never,
      })
      await app.ready()
      matchesCacheMock.readMatchesCache.mockResolvedValue(null)

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
      })

      expect(playerMatchRows.size).toBe(10)
    })

    it('cache hit만으로 응답할 때 fresh upsert를 하지 않는다', async () => {
      const upsertSpy = vi.spyOn(playerMatchStore, 'upsertFreshPlayerMatches')
      matchesCacheMock.readMatchesCache.mockResolvedValue({
        items: Array.from({ length: 10 }, (_, index) => ({
          matchId: String(index + 1),
          userNum: uidToUserNum(testUser.uid),
          characterNum: 1,
          characterName: '유키',
          placement: 1,
          kills: 1,
          deaths: 0,
          assists: 0,
          gameStartedAt: '2026-06-01T00:00:00Z',
          victory: true,
          gameMode: 'rank',
        })),
        next: undefined,
      })

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      expect(upsertSpy).not.toHaveBeenCalled()
      upsertSpy.mockRestore()
    })

    it('upsert 실패가 /matches 응답을 500으로 만들지 않는다', async () => {
      const failingRows = playerMatchRows
      app = await createApp({
        prisma: {
          playerMatch: {
            upsert: async () => {
              throw new Error('db down')
            },
            findUnique: async () => null,
            findMany: async () => [],
            findFirst: async () => null,
            count: async () => 0,
          },
          playerProfileRefreshState: {
            findUnique: async () => ({
              manualRefreshedAt: new Date(),
              lastCheckedAt: new Date(),
              lastFailedAt: null,
              nextRetryAt: null,
            }),
            upsert: async () => ({}),
          },
          matchesCache: {
            delete: async () => ({}),
          },
        } as never,
      })
      await app.ready()

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(failingRows.size).toBe(0)
    })

    it('full backfill — duplicate gameId를 만나도 시즌 전체 수집을 계속한다', async () => {
      for (let gameId = 6; gameId <= 10; gameId += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(gameId))
      }

      seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue([
        {
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          mmr: 2400,
          nickname: 'TestPlayer',
          rank: 100,
          rankSize: 1000,
          totalGames: 30,
          totalWins: 10,
          totalTeamKills: 30,
          totalDeaths: 5,
          averageRank: 3,
          averageKills: 2,
          averageAssistants: 3,
          top1: 0.2,
          top3: 0.6,
          characterStats: [],
        },
      ])
      seasonAggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(null)
      matchesCacheMock.readMatchesCache.mockResolvedValue(null)
      mockBserGamesPages(30)

      const started = Date.now()
      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
      })
      expect(Date.now() - started).toBeLessThan(5_000)

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()

      await drainSeasonAggregateBackgroundJobs(testUser.uid, 20)

      expect(bserMock.getUserGames.mock.calls.length).toBeGreaterThan(1)
      expect(playerMatchRows.size).toBe(30)
      expect(playerMatchRows.has(`${testUser.uid}:1`)).toBe(true)
      expect(playerMatchRows.has(`${testUser.uid}:30`)).toBe(true)

      const resAfterBackfill = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/season-aggregate?seasonId=11',
      })
      const body = resAfterBackfill.json() as {
        data: { coverage?: { collectedGames: number | null }; basisLabel?: string }
      }
      expect(body.data.coverage?.collectedGames).toBe(30)
      expect(body.data.basisLabel).toBe('시즌 전체 랭크 경기 기준')
    })

    it('mode=rank 수집 시 rank match만 PlayerMatch에 저장한다', async () => {
      bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
        const startIndex = cursor ?? 0
        if (startIndex >= 10) return { games: [], next: undefined }
        const games = Array.from({ length: 10 }, (_, index) =>
          makeBserGame(startIndex + index + 1, index % 2 === 0 ? 3 : 6),
        )
        return { games, next: undefined }
      })

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
      })

      expect(playerMatchRows.size).toBeGreaterThan(0)
      expect([...playerMatchRows.values()].every((row) => row.gameMode === 'rank')).toBe(true)
    })

    it('mode=all 수집 시 mapped freshMatches를 PlayerMatch에 저장한다', async () => {
      bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
        const startIndex = cursor ?? 0
        if (startIndex >= 10) return { games: [], next: undefined }
        const games = Array.from({ length: 10 }, (_, index) =>
          makeBserGame(startIndex + index + 1, index % 2 === 0 ? 3 : 6),
        )
        return { games, next: undefined }
      })

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=all&refresh=true',
      })

      const modes = new Set([...playerMatchRows.values()].map((row) => row.gameMode))
      expect(playerMatchRows.size).toBe(10)
      expect(modes.has('rank')).toBe(true)
      expect(modes.has('cobalt')).toBe(true)
    })

    it('pageSize=10이면 getUserGames 1회를 유지한다', async () => {
      mockBserGamesPages(10)

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
      })

      expect(bserMock.getUserGames).toHaveBeenCalledTimes(1)
    })
  })

  describe('/matches PlayerMatch DB-first reads', () => {
    it('DB에 pageSize만큼 rank 경기가 있으면 BSER 호출 없이 DB에서 반환한다', async () => {
      for (let index = 0; index < 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
          rpAfter: 2400 + index,
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      const body = res.json() as {
        data: { items: Array<{ matchId: string; gameMode?: string; rpAfter?: number }> }
        source: string
      }
      expect(body.data.items).toHaveLength(10)
      expect(body.data.items[0]?.matchId).toBe('10')
      expect(body.data.items.every((item) => item.gameMode === 'rank')).toBe(true)
      expect(body.source).toBe('cache')
    })

    it('page=1 요청 시 DB offset/limit이 정상 동작한다', async () => {
      for (let index = 0; index < 20; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(20 - index).padStart(2, '0')}T00:00:00Z`),
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=1&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      const body = res.json() as { data: { items: Array<{ matchId: string }> } }
      expect(body.data.items).toHaveLength(10)
      expect(body.data.items[0]?.matchId).toBe('11')
      expect(body.data.items[9]?.matchId).toBe('20')
    })

    it('mode=all은 전체 gameMode를 반환한다', async () => {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, '1', {
        gameMode: 'rank',
        playedAt: new Date('2026-06-20T00:00:00Z'),
      })
      seedPlayerMatchRow(playerMatchRows, testUser.uid, '2', {
        gameMode: 'cobalt',
        playedAt: new Date('2026-06-19T00:00:00Z'),
      })
      for (let index = 3; index <= 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=all',
      })

      const modes = new Set(res.json().data.items.map((item: { gameMode?: string }) => item.gameMode))
      expect(modes.has('rank')).toBe(true)
      expect(modes.has('cobalt')).toBe(true)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
    })

    it('refresh=true이면 DB 부족 시 collectMatches 보강 후 DB에서 응답한다', async () => {
      mockBserGamesPages(10)

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).toHaveBeenCalledTimes(1)
      expect(playerMatchRows.size).toBe(10)
      expect(res.json().source).toBe('cache')
    })

    it('DB 보강 후 재호출 시 BSER 없이 DB hit', async () => {
      mockBserGamesPages(10)

      await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&refresh=true',
      })
      bserMock.getUserGames.mockClear()

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      expect(res.json().source).toBe('cache')
    })

    it('userNum query는 무시하고 nickname uid 기준으로 DB를 조회한다', async () => {
      seedPlayerMatchRow(playerMatchRows, testUser.uid, '1', {
        gameMode: 'rank',
        playedAt: new Date('2026-06-20T00:00:00Z'),
      })
      for (let index = 2; index <= 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank&userNum=999999`,
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      expect(res.json().data.items[0]?.userNum).toBe(uidToUserNum(testUser.uid))
    })

    it('DB-first 응답에 loadout 상세 필드가 포함된다', async () => {
      for (let index = 0; index < 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
          accountLevel: 510,
          characterLevel: 20,
          bestWeapon: 20,
          tacticalSkillGroup: 120,
          traitFirstCore: 7_100_101,
          traitFirstSub: [7_110_701],
          traitSecondSub: [7_310_201],
          equipment: { '0': 119_503 },
          equipmentGrade: { '0': 5 },
          routeIdOfStart: 7143,
          routeSlotId: 0,
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      const item = res.json().data.items[0] as {
        bestWeapon?: number
        characterLevel?: number
        accountLevel?: number
        routeIdOfStart?: number
      }
      expect(item.bestWeapon).toBe(20)
      expect(item.characterLevel).toBe(20)
      expect(item.accountLevel).toBe(510)
      expect(item.routeIdOfStart).toBe(7143)
    })

    it('DB-first 응답에 gameDuration 필드가 포함된다', async () => {
      for (let index = 0; index < 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
          gameDuration: 1234 + index,
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      const item = res.json().data.items[0] as { gameDuration?: number }
      expect(item.gameDuration).toBe(1243)
    })

    it('stripped DB row도 기본 조회에서는 detail repair 없이 DB-first로 반환한다', async () => {
      for (let index = 0; index < 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          stripped: true,
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
        })
      }

      matchesCacheMock.readMatchesCache.mockResolvedValue({
        items: [
          {
            matchId: '10',
            userNum: uidToUserNum(testUser.uid),
            characterNum: 1,
            characterName: '유키',
            placement: 1,
            kills: 1,
            deaths: 0,
            assists: 0,
            gameStartedAt: '2026-06-20T00:00:00Z',
            victory: true,
            gameMode: 'rank',
            accountLevel: 510,
            characterLevel: 20,
            bestWeapon: 20,
            tacticalSkillGroup: 120,
            traitFirstCore: 7_100_101,
            traitFirstSub: [7_110_701],
            traitSecondSub: [7_310_201],
            equipment: { '0': 119_503 },
            equipmentGrade: { '0': 5 },
            routeIdOfStart: 7143,
            routeSlotId: 0,
          },
        ],
        next: undefined,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).not.toHaveBeenCalled()
      const item = res.json().data.items[0] as { matchId: string; bestWeapon?: number }
      expect(item.matchId).toBe('10')
      expect(item.bestWeapon).toBeUndefined()
      expect(playerMatchRows.get(`${testUser.uid}:10`)?.bestWeapon).toBeNull()
      expect(playerMatchRows.size).toBe(10)
    })

    it('detail repair 실패해도 /matches는 500이 아니다', async () => {
      for (let index = 0; index < 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          stripped: true,
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
        })
      }
      matchesCacheMock.readMatchesCache.mockResolvedValue(null)
      const repairSpy = vi
        .spyOn(playerMatchStore, 'repairPlayerMatchDetailsFromSources')
        .mockRejectedValueOnce(new Error('repair failed'))

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=rank',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.items).toHaveLength(10)
      repairSpy.mockRestore()
    })

    it('refresh=true — DB matches 캐시가 있어도 upstream 최신 page를 확인한다', async () => {
      for (let index = 0; index < 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`),
        })
      }
      matchesCacheMock.readMatchesCache.mockResolvedValue({
        items: Array.from({ length: 20 }, (_, index) => ({
          matchId: String(index + 1),
          userNum: 1,
          characterNum: 1,
          characterName: '유키',
          placement: 1,
          kills: 1,
          deaths: 0,
          assists: 0,
          gameStartedAt: `2026-06-01T00:00:0${index % 10}.000Z`,
          victory: true,
        })),
        next: 99,
      })
      bserMock.getUserGames.mockResolvedValueOnce({
        games: [{ ...makeBserGame(999), startDtm: '2026-06-20T12:00:00Z' }],
        next: undefined,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=all&refresh=true',
      })

      expect(res.statusCode).toBe(200)
      expect(bserMock.getUserGames).toHaveBeenCalled()
      expect(playerMatchRows.has(`${testUser.uid}:999`)).toBe(true)
      const body = res.json() as { data: { items: Array<{ matchId: string }> } }
      expect(body.data.items[0]?.matchId).toBe('999')
    })

    it('refresh=true — stale DB만 있을 때 Open API 최신 match를 upsert한다', async () => {
      for (let index = 0; index < 10; index += 1) {
        seedPlayerMatchRow(playerMatchRows, testUser.uid, String(index + 1), {
          gameMode: 'rank',
          playedAt: new Date(`2026-06-${String(index + 1).padStart(2, '0')}T00:00:00Z`),
        })
      }
      matchesCacheMock.readMatchesCache.mockResolvedValue(null)
      bserMock.getUserGames.mockImplementation(async (_uid: string, cursor?: number) => {
        if (cursor === undefined) {
          return {
            games: [{ ...makeBserGame(500), startDtm: '2026-06-20T12:00:00Z' }],
            next: 10,
          }
        }
        return { games: [makeBserGame(1)], next: undefined }
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/players/TestPlayer/matches?page=0&pageSize=10&mode=all&refresh=true',
      })

      expect(res.statusCode).toBe(200)
      expect(playerMatchRows.has(`${testUser.uid}:500`)).toBe(true)
      const body = res.json() as { data: { items: Array<{ matchId: string }> } }
      expect(body.data.items[0]?.matchId).toBe('500')
    })
  })

  describe('identity isolation', () => {
    const userA = { uid: 'uid-player-a', nickname: '아드마이할게요' }
    const userB = { uid: 'uid-player-b', nickname: 'gapri' }

    it('서로 다른 nickname의 resolveUser cache key가 다르다', async () => {
      bserMock.getUserByNickname.mockImplementation(async (nick: string) => {
        if (nick === userA.nickname) return userA
        if (nick === userB.nickname) return userB
        return null
      })

      const [resA, resB] = await Promise.all([
        app.inject({ method: 'GET', url: `/api/players/${encodeURIComponent(userA.nickname)}/summary` }),
        app.inject({ method: 'GET', url: `/api/players/${encodeURIComponent(userB.nickname)}/summary` }),
      ])

      expect(resA.statusCode).toBe(200)
      expect(resB.statusCode).toBe(200)
      expect(resA.json().data.userNum).toBe(uidToUserNum(userA.uid))
      expect(resB.json().data.userNum).toBe(uidToUserNum(userB.uid))
      expect(resA.json().data.userNum).not.toBe(resB.json().data.userNum)
    })

    it('concurrent resolveUser — 서로 다른 nickname은 inflight를 공유하지 않는다', async () => {
      bserMock.getUserByNickname.mockImplementation(async (nick: string) => {
        await new Promise((r) => setTimeout(r, 30))
        if (nick === userA.nickname) return userA
        if (nick === userB.nickname) return userB
        return null
      })

      const [resA, resB] = await Promise.all([
        app.inject({ method: 'GET', url: `/api/players/${encodeURIComponent(userA.nickname)}/summary` }),
        app.inject({ method: 'GET', url: `/api/players/${encodeURIComponent(userB.nickname)}/summary` }),
      ])

      expect(bserMock.getUserByNickname).toHaveBeenCalledTimes(2)
      expect(resA.json().data.userNum).toBe(uidToUserNum(userA.uid))
      expect(resB.json().data.userNum).toBe(uidToUserNum(userB.uid))
    })

    it('polluted nickname binding — 다른 사용자 binding이 있어도 BSER userNum을 유지한다', async () => {
      const bindingModule = await import('../cache/profileNicknameBinding.js')
      const aliasModule = await import('../cache/profileIdentityAlias.js')
      vi.spyOn(bindingModule, 'readPersistedNicknameBinding').mockResolvedValue({
        canonicalUid: userB.uid,
        canonicalUserNum: uidToUserNum(userB.uid),
      })
      vi.spyOn(aliasModule, 'readPersistedProfileAliasUids').mockResolvedValue([])
      vi.spyOn(bindingModule, 'deleteNicknameBinding').mockResolvedValue(true)

      bserMock.getUserByNickname.mockImplementation(async (nick: string) => {
        if (nick === userA.nickname) return userA
        if (nick === userB.nickname) return userB
        return null
      })
      bserMock.getUserRank.mockResolvedValue({ rank: 100, rankSize: 1000 })
      bserMock.getUserStats.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: `/api/players/${encodeURIComponent(userA.nickname)}/summary`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.userNum).toBe(uidToUserNum(userA.uid))
      expect(res.json().data.userNum).not.toBe(uidToUserNum(userB.uid))
    })

    it('endpoint identity mismatch는 PLAYER_IDENTITY_MISMATCH로 차단한다', async () => {
      bserMock.getUserByNickname.mockResolvedValue(userA)
      const squadStats = [
        {
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          mmr: 2400,
          nickname: userA.nickname,
          rank: 100,
          rankSize: 1000,
          totalGames: 30,
          totalWins: 10,
          totalTeamKills: 30,
          totalDeaths: 5,
          averageRank: 3,
          averageKills: 2,
          averageAssistants: 3,
          top1: 0.2,
          top3: 0.6,
          characterStats: [],
        },
      ]
      bserMock.getUserStats.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCache.mockResolvedValue(squadStats)
      seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockResolvedValue(squadStats)

      const mapSpy = vi.spyOn(await import('../external/bserMapper.js'), 'mapToPlayerStats')
      mapSpy.mockReturnValueOnce({
        games: 30,
        winRate: 33,
        avgKills: 2,
        avgPlacement: 3,
        kda: 3,
        kdaString: '3.00',
        mostPlayedCharacter: { name: '엠마', count: 10 },
        tier: 'DIAMOND',
        mmr: 2400,
        userNum: uidToUserNum(userB.uid),
      } as never)

      const res = await app.inject({
        method: 'GET',
        url: `/api/players/${encodeURIComponent(userA.nickname)}/stats`,
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('PLAYER_IDENTITY_MISMATCH')
      mapSpy.mockRestore()
    })
  })
})
