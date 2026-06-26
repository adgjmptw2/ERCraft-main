import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'

import type { PlayerSeasonAggregateContract, MatchSummaryContract } from '../contracts/player.js'
import type { BserUserStat } from '../external/bserClient.js'
import {
  buildAndWriteSeasonAggregateFromCaches,
  countAggregateRankGames,
  countRankCacheSeasonGames,
  mergeRankAndAllMatchItems,
  readMatchesForSeasonAggregate,
  readValidSeasonAggregate,
  refreshSeasonAggregateFromCaches,
  seasonAggregateHasMoreInformation,
  seasonAggregateNeedsRankCacheRebuild,
} from './seasonAggregateService.js'

type TestPlayerMatchRow = {
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
}

const aggregateCacheMock = vi.hoisted(() => ({
  readSeasonAggregateCache: vi.fn(),
  writeSeasonAggregateCache: vi.fn(),
}))

const seasonStatsCacheMock = vi.hoisted(() => ({
  readSeasonStatsCacheSnapshot: vi.fn(),
}))

const matchesCacheMock = vi.hoisted(() => ({
  readMatchesCacheSnapshot: vi.fn(),
}))

vi.mock('./seasonAggregateCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./seasonAggregateCache.js')>()
  return {
    ...actual,
    readSeasonAggregateCache: aggregateCacheMock.readSeasonAggregateCache,
    writeSeasonAggregateCache: aggregateCacheMock.writeSeasonAggregateCache,
  }
})

vi.mock('./seasonStatsCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./seasonStatsCache.js')>()
  return {
    ...actual,
    readSeasonStatsCacheSnapshot: seasonStatsCacheMock.readSeasonStatsCacheSnapshot,
  }
})

vi.mock('./matchesCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./matchesCache.js')>()
  return {
    ...actual,
    readMatchesCacheSnapshot: matchesCacheMock.readMatchesCacheSnapshot,
  }
})

const prisma = {} as PrismaClient
const UID = '123456'
const API_SEASON = 39
const DISPLAY_SEASON = 11

function createPlayerMatchPrisma(rows: Map<string, TestPlayerMatchRow>): PrismaClient {
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
          rows.set(key, { ...existing, ...(update as Partial<TestPlayerMatchRow>) })
          return rows.get(key)!
        }
        const created: TestPlayerMatchRow = {
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
        let list = [...rows.values()].filter((row) => {
          if (where.uid !== undefined && row.uid !== where.uid) return false
          if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) return false
          if (where.displaySeasonId !== undefined && row.displaySeasonId !== where.displaySeasonId) {
            return false
          }
          if (where.gameMode !== undefined && row.gameMode !== where.gameMode) return false
          return true
        })
        if (orderBy.playedAt === 'desc') {
          list = list.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
        }
        const offset = skip ?? 0
        const limit = take ?? list.length
        return list.slice(offset, offset + limit)
      },
      count: async ({ where }: { where: Prisma.PlayerMatchWhereInput }) => {
        const list = [...rows.values()].filter((row) => {
          if (where.uid !== undefined && row.uid !== where.uid) return false
          if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) return false
          if (where.displaySeasonId !== undefined && row.displaySeasonId !== where.displaySeasonId) {
            return false
          }
          if (where.gameMode !== undefined && row.gameMode !== where.gameMode) return false
          return true
        })
        return list.length
      },
      findUnique: async ({
        where,
      }: {
        where: { uid_gameId: { uid: string; gameId: string } }
      }) => {
        const key = `${where.uid_gameId.uid}:${where.uid_gameId.gameId}`
        const row = rows.get(key)
        return row ? { id: row.id } : null
      },
    },
  } as unknown as PrismaClient
}

function seedPlayerMatchRankRow(
  rows: Map<string, TestPlayerMatchRow>,
  uid: string,
  gameId: string,
  index: number,
  overrides: Partial<TestPlayerMatchRow> = {},
): void {
  rows.set(`${uid}:${gameId}`, {
    id: BigInt(rows.size + 1),
    uid,
    gameId,
    gameMode: 'rank',
    apiSeasonId: API_SEASON,
    displaySeasonId: DISPLAY_SEASON,
    playedAt: new Date(`2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:00:00+09:00`),
    characterNum: index % 2 === 0 ? 19 : 17,
    characterName: index % 2 === 0 ? '엠마' : '아드리아나',
    placement: 2,
    kills: 3,
    deaths: 1,
    assists: 2,
    teamKills: 8,
    damageToPlayer: 12000,
    victory: false,
    rpAfter: 8000 + index * 10,
    rpDelta: 10,
    ...overrides,
  })
}

function aggregate(
  overrides: Partial<PlayerSeasonAggregateContract> = {},
): PlayerSeasonAggregateContract {
  return {
    userNum: 123456,
    seasonId: DISPLAY_SEASON,
    apiSeasonId: API_SEASON,
    cacheStatus: 'ready',
    characterStats: [
      {
        characterNum: 19,
        games: 10,
        wins: 3,
        winRate: 30,
        avgRank: 4,
        kills: 20,
        assists: 30,
        deaths: 10,
        kda: 5,
        avgTeamKills: 8,
        avgKills: 2,
        avgDamage: 12000,
        gradeLabel: null,
      },
    ],
    rpSeries: [
      { matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8000 },
      { matchId: 'm-2', dateLabel: '6. 11.', rpAfter: 8100 },
    ],
    lastRefreshedAt: '2026-06-13T00:00:00.000Z',
    coverage: {
      officialSeasonGames: null,
      collectedGames: 10,
      characterCount: 1,
      rpPointCount: 2,
      coverageRatio: null,
    },
    ...overrides,
  }
}

function stat(overrides: Partial<BserUserStat> = {}): BserUserStat {
  return {
    seasonId: API_SEASON,
    matchingMode: 3,
    matchingTeamMode: 3,
    mmr: 8300,
    nickname: 'Tester',
    rank: 1,
    rankSize: 100,
    totalGames: 10,
    totalWins: 3,
    totalTeamKills: 80,
    totalDeaths: 20,
    averageRank: 4,
    averageKills: 2,
    averageAssistants: 3,
    top1: 0.1,
    top3: 0.4,
    ...overrides,
  }
}

function match(
  overrides: Partial<MatchSummaryContract> & Pick<MatchSummaryContract, 'matchId'>,
): MatchSummaryContract {
  return {
    userNum: 123456,
    characterNum: 19,
    characterName: '엠마',
    placement: 2,
    kills: 3,
    deaths: 1,
    assists: 2,
    gameStartedAt: '2026-06-10T10:00:00+09:00',
    victory: false,
    seasonNumber: DISPLAY_SEASON,
    gameMode: 'rank',
    ...overrides,
  }
}

function rankMatch(id: string, overrides: Partial<MatchSummaryContract> = {}): MatchSummaryContract {
  return match({
    matchId: id,
    gameMode: 'rank',
    rpAfter: 8000,
    ...overrides,
  })
}

function normalMatch(id: string): MatchSummaryContract {
  return match({
    matchId: id,
    gameMode: 'normal',
    rpAfter: undefined,
    gameStartedAt: '2026-06-12T10:00:00+09:00',
  })
}

function mockMatchCaches(rankItems: MatchSummaryContract[], allItems: MatchSummaryContract[]) {
  matchesCacheMock.readMatchesCacheSnapshot.mockImplementation(async (_prisma, id: string) => {
    if (id.endsWith(':rank')) return { items: rankItems }
    if (id.endsWith(':0')) return { items: allItems }
    return null
  })
}

describe('seasonAggregateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(null)
    aggregateCacheMock.writeSeasonAggregateCache.mockResolvedValue(undefined)
    seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockResolvedValue(null)
    matchesCacheMock.readMatchesCacheSnapshot.mockResolvedValue(null)
  })

  it('ready + valid cache는 바로 반환', async () => {
    const cached = aggregate()
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(cached)

    await expect(readValidSeasonAggregate(prisma, 'uid-1', API_SEASON)).resolves.toBe(cached)
    expect(aggregateCacheMock.readSeasonAggregateCache).toHaveBeenCalledWith(prisma, 'uid-1:39')
  })

  it('warming cache는 valid로 반환하지 않음', async () => {
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      aggregate({ cacheStatus: 'warming' }),
    )

    await expect(readValidSeasonAggregate(prisma, 'uid-1', API_SEASON)).resolves.toBeNull()
  })

  it('partial cache는 valid로 반환하지 않음', async () => {
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(
      aggregate({ cacheStatus: 'partial', characterStats: [], rpSeries: [] }),
    )

    await expect(readValidSeasonAggregate(prisma, 'uid-1', API_SEASON)).resolves.toBeNull()
  })

  it('mergeRankAndAllMatchItems — rank 우선 dedupe', () => {
    const rankItems = [
      rankMatch('shared', { rpAfter: 9000, characterName: '엠마' }),
      rankMatch('rank-only'),
    ]
    const allItems = [
      rankMatch('shared', { rpAfter: 1000, characterName: '구버전' }),
      normalMatch('all-only'),
    ]
    const merged = mergeRankAndAllMatchItems(rankItems, allItems)
    expect(merged).toHaveLength(3)
    expect(merged.find((row) => row.matchId === 'shared')?.rpAfter).toBe(9000)
    expect(merged.find((row) => row.matchId === 'shared')?.characterName).toBe('엠마')
    expect(merged.map((row) => row.matchId)).toEqual(['shared', 'rank-only', 'all-only'])
  })

  it('uid:0 normal 위주 + uid:rank rank 10개면 aggregate는 rank 기준으로 rp/characterStats 생성', async () => {
    const rankItems = Array.from({ length: 10 }, (_, index) =>
      rankMatch(`rank-${index + 1}`, {
        gameStartedAt: `2026-06-${String(index + 1).padStart(2, '0')}T10:00:00+09:00`,
        rpAfter: 8000 + index * 10,
        characterNum: index % 2 === 0 ? 19 : 17,
        characterName: index % 2 === 0 ? '엠마' : '아드리아나',
      }),
    )
    const allItems = [
      normalMatch('normal-1'),
      normalMatch('normal-2'),
      rankMatch('rank-1', { rpAfter: 7999 }),
      rankMatch('rank-2', { rpAfter: 7998 }),
      rankMatch('rank-3', { rpAfter: 7997 }),
    ]
    mockMatchCaches(rankItems, allItems)

    const result = await buildAndWriteSeasonAggregateFromCaches({
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(result.source).toBe('matchCache')
    expect(result.rpSeries.length).toBeGreaterThanOrEqual(2)
    expect(result.characterStats.reduce((sum, row) => sum + row.games, 0)).toBe(10)
    expect(matchesCacheMock.readMatchesCacheSnapshot).toHaveBeenCalledWith(prisma, `${UID}:rank`)
    expect(matchesCacheMock.readMatchesCacheSnapshot).toHaveBeenCalledWith(prisma, `${UID}:0`)
  })

  it('uid:rank가 비어 있으면 uid:0 fallback', async () => {
    mockMatchCaches(
      [],
      [
        rankMatch('a', { rpAfter: 8000 }),
        rankMatch('b', { rpAfter: 8100, gameStartedAt: '2026-06-11T10:00:00+09:00' }),
      ],
    )

    const result = await buildAndWriteSeasonAggregateFromCaches({
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
    })

    expect(result.cacheStatus).toBe('ready')
    expect(result.rpSeries).toHaveLength(2)
  })

  it('ready aggregate collectedGames=3 + uid:rank rank 10개면 cache-only rebuild', async () => {
    const cached = aggregate({
      characterStats: [{ ...aggregate().characterStats[0]!, games: 3 }],
      rpSeries: [{ matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8000 }],
      coverage: {
        officialSeasonGames: null,
        collectedGames: 3,
        characterCount: 1,
        rpPointCount: 1,
        coverageRatio: null,
      },
    })
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(cached)

    const rankItems = Array.from({ length: 10 }, (_, index) =>
      rankMatch(`rank-${index + 1}`, {
        gameStartedAt: `2026-06-${String(index + 1).padStart(2, '0')}T10:00:00+09:00`,
        rpAfter: 8000 + index * 10,
      }),
    )
    mockMatchCaches(rankItems, [normalMatch('normal-1'), normalMatch('normal-2')])

    expect(seasonAggregateNeedsRankCacheRebuild(cached, 10)).toBe(true)

    const result = await refreshSeasonAggregateFromCaches({
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(result.rpSeries.length).toBeGreaterThan(1)
    expect(result.characterStats[0]?.games).toBe(10)
    expect(aggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(seasonStatsCacheMock.readSeasonStatsCacheSnapshot).toHaveBeenCalled()
  })

  it('ready aggregate가 rank cache보다 풍부하면 rebuild하지 않음', async () => {
    const cached = aggregate({
      coverage: {
        officialSeasonGames: null,
        collectedGames: 10,
        characterCount: 1,
        rpPointCount: 2,
        coverageRatio: null,
      },
    })
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(cached)
    mockMatchCaches(
      Array.from({ length: 5 }, (_, index) => rankMatch(`rank-${index + 1}`)),
      [],
    )

    const rankCount = await countRankCacheSeasonGames(prisma, UID, DISPLAY_SEASON, API_SEASON)
    expect(seasonAggregateNeedsRankCacheRebuild(cached, rankCount)).toBe(false)

    const result = await refreshSeasonAggregateFromCaches({
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
    })

    expect(result).toBe(cached)
    expect(aggregateCacheMock.writeSeasonAggregateCache).not.toHaveBeenCalled()
  })

  it('seasonAggregateHasMoreInformation — rpPointCount/collectedGames 증가 감지', () => {
    const current = aggregate({
      coverage: {
        officialSeasonGames: null,
        collectedGames: 3,
        characterCount: 1,
        rpPointCount: 1,
        coverageRatio: null,
      },
    })
    const next = aggregate({
      rpSeries: [
        { matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8000 },
        { matchId: 'm-2', dateLabel: '6. 11.', rpAfter: 8100 },
      ],
      coverage: {
        officialSeasonGames: null,
        collectedGames: 10,
        characterCount: 1,
        rpPointCount: 2,
        coverageRatio: null,
      },
    })
    expect(seasonAggregateHasMoreInformation(next, current)).toBe(true)
  })

  it('SeasonStatsCache + rank/all MatchesCache를 읽어 builder 결과를 저장', async () => {
    seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockResolvedValue([
      stat({
        characterStats: [
          {
            characterCode: 19,
            totalGames: 12,
            maxKillings: 9,
            top3: 6,
            wins: 4,
            averageRank: 4,
          },
        ],
      }),
    ])
    mockMatchCaches(
      Array.from({ length: 12 }, (_, index) =>
        rankMatch(String(index + 1), {
          gameStartedAt: `2026-06-${String(10 + (index % 3)).padStart(2, '0')}T10:00:00+09:00`,
          rpAfter: 8000 + index * 10,
        }),
      ),
      [],
    )

    const result = await buildAndWriteSeasonAggregateFromCaches({
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(result.source).toBe('mixed')
    expect(result.cacheStatus).toBe('ready')
    expect(result.characterStats[0]?.games).toBe(12)
    expect(result.rpSeries.length).toBeGreaterThanOrEqual(2)
    expect(seasonStatsCacheMock.readSeasonStatsCacheSnapshot).toHaveBeenCalledWith(
      prisma,
      `${UID}:${API_SEASON}`,
    )
    expect(matchesCacheMock.readMatchesCacheSnapshot).toHaveBeenCalledWith(prisma, `${UID}:rank`)
    expect(matchesCacheMock.readMatchesCacheSnapshot).toHaveBeenCalledWith(prisma, `${UID}:0`)
  })

  it('stats 없음 + rank matches 있음이면 matchCache source로 저장', async () => {
    mockMatchCaches(
      [
        rankMatch('a', { rpAfter: 8000 }),
        rankMatch('b', { rpAfter: 8100, gameStartedAt: '2026-06-11T10:00:00+09:00' }),
      ],
      [],
    )

    const result = await buildAndWriteSeasonAggregateFromCaches({
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
    })

    expect(result.source).toBe('matchCache')
    expect(result.cacheStatus).toBe('ready')
  })

  it('둘 다 부족하면 partial 저장', async () => {
    const result = await buildAndWriteSeasonAggregateFromCaches({
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
    })

    expect(result.cacheStatus).toBe('partial')
    expect(result.characterStats).toEqual([])
    expect(result.rpSeries).toEqual([])
    expect(aggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
  })

  it('같은 key 동시 refresh는 dedupe', async () => {
    mockMatchCaches(
      [
        rankMatch('a', { rpAfter: 8000 }),
        rankMatch('b', { rpAfter: 8100, gameStartedAt: '2026-06-11T10:00:00+09:00' }),
      ],
      [],
    )
    matchesCacheMock.readMatchesCacheSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ items: [rankMatch('a', { rpAfter: 8000 })] }), 10)
        }),
    )

    const request = {
      prisma,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
    }

    const [a, b] = await Promise.all([
      refreshSeasonAggregateFromCaches(request),
      refreshSeasonAggregateFromCaches(request),
    ])

    expect(a).toBe(b)
    expect(aggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalledTimes(1)
  })

  it('PlayerMatch rank 30 + MatchesCache rank 10이면 aggregate는 PlayerMatch 30개 기준', async () => {
    const rows = new Map<string, TestPlayerMatchRow>()
    const prismaWithMatches = createPlayerMatchPrisma(rows)
    for (let index = 0; index < 30; index += 1) {
      seedPlayerMatchRankRow(rows, UID, `pm-${index + 1}`, index)
    }
    mockMatchCaches(
      Array.from({ length: 10 }, (_, index) => rankMatch(`cache-${index + 1}`)),
      [],
    )

    const result = await buildAndWriteSeasonAggregateFromCaches({
      prisma: prismaWithMatches,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(result.source).toBe('playerMatch')
    expect(result.coverage?.collectedGames).toBe(30)
    expect(result.characterStats.reduce((sum, row) => sum + row.games, 0)).toBe(30)
    expect(matchesCacheMock.readMatchesCacheSnapshot).not.toHaveBeenCalled()
  })

  it('PlayerMatch에 데이터가 있으면 MatchesCache보다 PlayerMatch를 우선', async () => {
    const rows = new Map<string, TestPlayerMatchRow>()
    const prismaWithMatches = createPlayerMatchPrisma(rows)
    seedPlayerMatchRankRow(rows, UID, 'pm-1', 0, { rpAfter: 9000 })
    seedPlayerMatchRankRow(rows, UID, 'pm-2', 1, {
      rpAfter: 9100,
      playedAt: new Date('2026-06-11T10:00:00+09:00'),
    })
    mockMatchCaches(
      [
        rankMatch('cache-1', { rpAfter: 1000 }),
        rankMatch('cache-2', { rpAfter: 1001, gameStartedAt: '2026-06-11T10:00:00+09:00' }),
      ],
      [],
    )

    const read = await readMatchesForSeasonAggregate(prismaWithMatches, {
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
    })

    expect(read.inputSource).toBe('playerMatch')
    expect(read.matches).toHaveLength(2)
    expect(read.matches[0]?.rpAfter).toBe(9100)
    expect(matchesCacheMock.readMatchesCacheSnapshot).not.toHaveBeenCalled()
  })

  it('PlayerMatch가 비어 있으면 MatchesCache fallback', async () => {
    const rows = new Map<string, TestPlayerMatchRow>()
    const prismaWithMatches = createPlayerMatchPrisma(rows)
    mockMatchCaches(
      [
        rankMatch('cache-1', { rpAfter: 8000 }),
        rankMatch('cache-2', { rpAfter: 8100, gameStartedAt: '2026-06-11T10:00:00+09:00' }),
      ],
      [],
    )

    const read = await readMatchesForSeasonAggregate(prismaWithMatches, {
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
    })

    expect(read.inputSource).toBe('matchesCache')
    expect(read.fallbackReason).toBe('empty-player-match')
    expect(read.matches).toHaveLength(2)
  })

  it('ready coverage=10 + PlayerMatch count=30이면 DB-only rebuild 후 coverage=30', async () => {
    const rows = new Map<string, TestPlayerMatchRow>()
    const prismaWithMatches = createPlayerMatchPrisma(rows)
    for (let index = 0; index < 30; index += 1) {
      seedPlayerMatchRankRow(rows, UID, `pm-${index + 1}`, index)
    }
    const cached = aggregate({
      coverage: {
        officialSeasonGames: null,
        collectedGames: 10,
        characterCount: 1,
        rpPointCount: 2,
        coverageRatio: null,
      },
    })
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(cached)
    mockMatchCaches(Array.from({ length: 10 }, (_, index) => rankMatch(`cache-${index + 1}`)), [])

    const rankCount = await countAggregateRankGames(
      prismaWithMatches,
      UID,
      DISPLAY_SEASON,
      API_SEASON,
    )
    expect(rankCount).toBe(30)
    expect(seasonAggregateNeedsRankCacheRebuild(cached, rankCount)).toBe(true)

    const result = await refreshSeasonAggregateFromCaches({
      prisma: prismaWithMatches,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(result.coverage?.collectedGames).toBe(30)
    expect(aggregateCacheMock.writeSeasonAggregateCache).toHaveBeenCalled()
    expect(matchesCacheMock.readMatchesCacheSnapshot).not.toHaveBeenCalled()
  })

  it('ready coverage=30 + PlayerMatch count=30이면 rebuild하지 않음', async () => {
    const rows = new Map<string, TestPlayerMatchRow>()
    const prismaWithMatches = createPlayerMatchPrisma(rows)
    for (let index = 0; index < 30; index += 1) {
      seedPlayerMatchRankRow(rows, UID, `pm-${index + 1}`, index)
    }
    const cached = aggregate({
      coverage: {
        officialSeasonGames: null,
        collectedGames: 30,
        characterCount: 0,
        rpPointCount: 2,
        coverageRatio: null,
      },
    })
    aggregateCacheMock.readSeasonAggregateCache.mockResolvedValue(cached)

    const result = await refreshSeasonAggregateFromCaches({
      prisma: prismaWithMatches,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
    })

    expect(result).toBe(cached)
    expect(aggregateCacheMock.writeSeasonAggregateCache).not.toHaveBeenCalled()
  })

  it('normal/cobalt PlayerMatch row는 rank aggregate에 포함되지 않음', async () => {
    const rows = new Map<string, TestPlayerMatchRow>()
    const prismaWithMatches = createPlayerMatchPrisma(rows)
    seedPlayerMatchRankRow(rows, UID, 'rank-1', 0)
    seedPlayerMatchRankRow(rows, UID, 'normal-1', 1, { gameMode: 'normal' })
    seedPlayerMatchRankRow(rows, UID, 'cobalt-1', 2, { gameMode: 'cobalt' })

    const read = await readMatchesForSeasonAggregate(prismaWithMatches, {
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
    })

    expect(read.playerMatchCount).toBe(1)
    expect(read.matches).toHaveLength(1)
    expect(read.matches[0]?.gameMode).toBe('rank')
  })

  it('officialSeasonGames는 SeasonStatsCache 기준 유지', async () => {
    const rows = new Map<string, TestPlayerMatchRow>()
    const prismaWithMatches = createPlayerMatchPrisma(rows)
    seedPlayerMatchRankRow(rows, UID, 'pm-1', 0)
    seasonStatsCacheMock.readSeasonStatsCacheSnapshot.mockResolvedValue([
      stat({ totalGames: 42 }),
    ])

    const result = await buildAndWriteSeasonAggregateFromCaches({
      prisma: prismaWithMatches,
      uid: UID,
      apiSeasonId: API_SEASON,
      displaySeasonId: DISPLAY_SEASON,
      isCurrent: true,
    })

    expect(result.coverage?.officialSeasonGames).toBe(42)
    expect(result.coverage?.coverageRatio).not.toBeNull()
  })
})
