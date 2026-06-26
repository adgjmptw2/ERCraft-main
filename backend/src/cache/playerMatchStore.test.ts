import { describe, expect, it } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'

import type { MatchSummaryContract } from '../contracts/player.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import { uidToUserNum } from '../external/bserMapper.js'
import {
  countPlayerMatchesForSeason,
  getLatestPlayerMatch,
  hasPlayerMatch,
  matchSummaryHasLoadoutDetail,
  matchSummaryMissingLoadoutDetail,
  readMatchesPageFromPlayerMatch,
  readMatchesPageFromVerifiedSources,
  readPlayerMatchesForSeason,
  repairPlayerMatchDetailsFromSources,
  resolvePlayerMatchStoreContext,
  toMatchSummaryFromPlayerMatch,
  toPlayerMatchInput,
  upsertFreshPlayerMatches,
  upsertPlayerMatches,
} from './playerMatchStore.js'

type PlayerMatchRow = {
  id: bigint
  uid: string
  apiSeasonId: number
  displaySeasonId: number
  gameId: string
  gameMode: string
  matchingMode: number | null
  matchingTeamMode: number | null
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
  gameDuration: number | null
  cobaltInfusions: unknown | null
  accountLevel: number | null
  characterLevel: number | null
  skinCode: number | null
  bestWeapon: number | null
  bestWeaponLevel: number | null
  tacticalSkillGroup: number | null
  tacticalSkillLevel: number | null
  traitFirstCore: number | null
  traitFirstSub: unknown | null
  traitSecondSub: unknown | null
  equipment: unknown | null
  equipmentGrade: unknown | null
  routeIdOfStart: number | null
  routeSlotId: number | null
  masteryLevel: unknown | null
  skillLevelInfo: unknown | null
  skillOrderInfo: unknown | null
  rawJson: unknown | null
  createdAt: Date
  updatedAt: Date
}

function loadoutFieldsFromCreate(create: Prisma.PlayerMatchCreateInput) {
  return {
    accountLevel: create.accountLevel ?? null,
    characterLevel: create.characterLevel ?? null,
    skinCode: create.skinCode ?? null,
    bestWeapon: create.bestWeapon ?? null,
    bestWeaponLevel: create.bestWeaponLevel ?? null,
    tacticalSkillGroup: create.tacticalSkillGroup ?? null,
    tacticalSkillLevel: create.tacticalSkillLevel ?? null,
    traitFirstCore: create.traitFirstCore ?? null,
    traitFirstSub: create.traitFirstSub ?? null,
    traitSecondSub: create.traitSecondSub ?? null,
    equipment: create.equipment ?? null,
    equipmentGrade: create.equipmentGrade ?? null,
    routeIdOfStart: create.routeIdOfStart ?? null,
    routeSlotId: create.routeSlotId ?? null,
    masteryLevel: create.masteryLevel ?? null,
    skillLevelInfo: create.skillLevelInfo ?? null,
    skillOrderInfo: create.skillOrderInfo ?? null,
  }
}

function loadoutFieldsFromUpdate(
  row: PlayerMatchRow,
  update: Prisma.PlayerMatchUpdateInput,
): Pick<
  PlayerMatchRow,
  | 'accountLevel'
  | 'characterLevel'
  | 'skinCode'
  | 'bestWeapon'
  | 'bestWeaponLevel'
  | 'tacticalSkillGroup'
  | 'tacticalSkillLevel'
  | 'traitFirstCore'
  | 'traitFirstSub'
  | 'traitSecondSub'
  | 'equipment'
  | 'equipmentGrade'
  | 'routeIdOfStart'
  | 'routeSlotId'
  | 'masteryLevel'
  | 'skillLevelInfo'
  | 'skillOrderInfo'
> {
  return {
    accountLevel:
      update.accountLevel === null || typeof update.accountLevel === 'number'
        ? update.accountLevel ?? null
        : row.accountLevel,
    characterLevel:
      update.characterLevel === null || typeof update.characterLevel === 'number'
        ? update.characterLevel ?? null
        : row.characterLevel,
    skinCode:
      update.skinCode === null || typeof update.skinCode === 'number'
        ? update.skinCode ?? null
        : row.skinCode,
    bestWeapon:
      update.bestWeapon === null || typeof update.bestWeapon === 'number'
        ? update.bestWeapon ?? null
        : row.bestWeapon,
    bestWeaponLevel:
      update.bestWeaponLevel === null || typeof update.bestWeaponLevel === 'number'
        ? update.bestWeaponLevel ?? null
        : row.bestWeaponLevel,
    tacticalSkillGroup:
      update.tacticalSkillGroup === null || typeof update.tacticalSkillGroup === 'number'
        ? update.tacticalSkillGroup ?? null
        : row.tacticalSkillGroup,
    tacticalSkillLevel:
      update.tacticalSkillLevel === null || typeof update.tacticalSkillLevel === 'number'
        ? update.tacticalSkillLevel ?? null
        : row.tacticalSkillLevel,
    traitFirstCore:
      update.traitFirstCore === null || typeof update.traitFirstCore === 'number'
        ? update.traitFirstCore ?? null
        : row.traitFirstCore,
    traitFirstSub: update.traitFirstSub !== undefined ? update.traitFirstSub : row.traitFirstSub,
    traitSecondSub:
      update.traitSecondSub !== undefined ? update.traitSecondSub : row.traitSecondSub,
    equipment: update.equipment !== undefined ? update.equipment : row.equipment,
    equipmentGrade:
      update.equipmentGrade !== undefined ? update.equipmentGrade : row.equipmentGrade,
    routeIdOfStart:
      update.routeIdOfStart === null || typeof update.routeIdOfStart === 'number'
        ? update.routeIdOfStart ?? null
        : row.routeIdOfStart,
    routeSlotId:
      update.routeSlotId === null || typeof update.routeSlotId === 'number'
        ? update.routeSlotId ?? null
        : row.routeSlotId,
    masteryLevel: update.masteryLevel !== undefined ? update.masteryLevel : row.masteryLevel,
    skillLevelInfo:
      update.skillLevelInfo !== undefined ? update.skillLevelInfo : row.skillLevelInfo,
    skillOrderInfo:
      update.skillOrderInfo !== undefined ? update.skillOrderInfo : row.skillOrderInfo,
  }
}

function rowFromCreate(create: Prisma.PlayerMatchCreateInput, id: bigint, now: Date): PlayerMatchRow {
  return {
    id,
    uid: create.uid,
    apiSeasonId: create.apiSeasonId,
    displaySeasonId: create.displaySeasonId,
    gameId: create.gameId,
    gameMode: create.gameMode,
    matchingMode: create.matchingMode ?? null,
    matchingTeamMode: create.matchingTeamMode ?? null,
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
    ...loadoutFieldsFromCreate(create),
    rawJson: create.rawJson ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

function applyUpdate(row: PlayerMatchRow, update: Prisma.PlayerMatchUpdateInput, now: Date): PlayerMatchRow {
  return {
    ...row,
    apiSeasonId: typeof update.apiSeasonId === 'number' ? update.apiSeasonId : row.apiSeasonId,
    displaySeasonId:
      typeof update.displaySeasonId === 'number' ? update.displaySeasonId : row.displaySeasonId,
    gameMode: typeof update.gameMode === 'string' ? update.gameMode : row.gameMode,
    matchingMode:
      update.matchingMode === null || typeof update.matchingMode === 'number'
        ? update.matchingMode ?? null
        : row.matchingMode,
    matchingTeamMode:
      update.matchingTeamMode === null || typeof update.matchingTeamMode === 'number'
        ? update.matchingTeamMode ?? null
        : row.matchingTeamMode,
    playedAt: update.playedAt instanceof Date ? update.playedAt : row.playedAt,
    characterNum: typeof update.characterNum === 'number' ? update.characterNum : row.characterNum,
    characterName:
      update.characterName === null || typeof update.characterName === 'string'
        ? update.characterName ?? null
        : row.characterName,
    placement:
      update.placement === null || typeof update.placement === 'number'
        ? update.placement ?? null
        : row.placement,
    kills: update.kills === null || typeof update.kills === 'number' ? update.kills ?? null : row.kills,
    deaths:
      update.deaths === null || typeof update.deaths === 'number' ? update.deaths ?? null : row.deaths,
    assists:
      update.assists === null || typeof update.assists === 'number' ? update.assists ?? null : row.assists,
    teamKills:
      update.teamKills === null || typeof update.teamKills === 'number'
        ? update.teamKills ?? null
        : row.teamKills,
    damageToPlayer:
      update.damageToPlayer === null || typeof update.damageToPlayer === 'number'
        ? update.damageToPlayer ?? null
        : row.damageToPlayer,
    victory:
      update.victory === null || typeof update.victory === 'boolean'
        ? update.victory ?? null
        : row.victory,
    rpAfter:
      update.rpAfter === null || typeof update.rpAfter === 'number' ? update.rpAfter ?? null : row.rpAfter,
    rpDelta:
      update.rpDelta === null || typeof update.rpDelta === 'number' ? update.rpDelta ?? null : row.rpDelta,
    gameDuration:
      update.gameDuration === null || typeof update.gameDuration === 'number'
        ? update.gameDuration ?? null
        : row.gameDuration ?? null,
    ...loadoutFieldsFromUpdate(row, update),
    rawJson: update.rawJson !== undefined ? update.rawJson : row.rawJson,
    updatedAt: now,
  }
}

function baseMatch(overrides: Partial<MatchSummaryContract> = {}): MatchSummaryContract {
  return {
    matchId: '1001',
    userNum: 42,
    characterNum: 19,
    characterName: '엠마',
    placement: 2,
    kills: 3,
    deaths: 1,
    assists: 4,
    gameStartedAt: '2026-06-10T12:00:00.000Z',
    victory: true,
    gameMode: 'rank',
    seasonNumber: 11,
    rpAfter: 4200,
    rpDelta: 35,
    teamKills: 8,
    damageToPlayers: 12_500,
    ...overrides,
  }
}

function loadoutMatch(overrides: Partial<MatchSummaryContract> = {}): MatchSummaryContract {
  return baseMatch({
    accountLevel: 510,
    characterLevel: 20,
    skinCode: 1_056_002,
    bestWeapon: 20,
    tacticalSkillGroup: 120,
    traitFirstCore: 7_100_101,
    traitFirstSub: [7_110_701, 7_110_601],
    traitSecondSub: [7_310_201, 7_310_301],
    equipment: { '0': 119_503, '1': 202_503 },
    equipmentGrade: { '0': 5, '1': 5 },
    routeIdOfStart: 7143,
    routeSlotId: 0,
    ...overrides,
  })
}

function createInMemoryPlayerMatchPrisma(): {
  prisma: PrismaClient
  rows: Map<string, PlayerMatchRow>
} {
  const rows = new Map<string, PlayerMatchRow>()
  let nextId = 1n

  const prisma = {
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
        const now = new Date()

        if (existing) {
          const merged = applyUpdate(existing, update, now)
          rows.set(key, merged)
          return merged
        }

        const created = rowFromCreate(create, nextId, now)
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
          if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) {
            return false
          }
          if (
            where.displaySeasonId !== undefined &&
            row.displaySeasonId !== where.displaySeasonId
          ) {
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
          if (where.apiSeasonId !== undefined && row.apiSeasonId !== where.apiSeasonId) {
            return false
          }
          if (
            where.displaySeasonId !== undefined &&
            row.displaySeasonId !== where.displaySeasonId
          ) {
            return false
          }
          if (where.gameMode !== undefined && row.gameMode !== where.gameMode) return false
          return true
        })
        return list.length
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Prisma.PlayerMatchWhereInput
        orderBy: { playedAt: 'desc' }
      }) => {
        const list = await prisma.playerMatch.findMany({ where, orderBy })
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
  } as unknown as PrismaClient

  return { prisma, rows }
}

describe('playerMatchStore', () => {
  it('toPlayerMatchInput — MatchSummaryContract 필드를 안전하게 매핑', () => {
    const input = toPlayerMatchInput('uid-a', baseMatch(), {
      apiSeasonId: 39,
      displaySeasonId: 11,
      matchingMode: 3,
      matchingTeamMode: 3,
    })

    expect(input).toMatchObject({
      uid: 'uid-a',
      apiSeasonId: 39,
      displaySeasonId: 11,
      gameId: '1001',
      gameMode: 'rank',
      matchingMode: 3,
      matchingTeamMode: 3,
      characterNum: 19,
      characterName: '엠마',
      placement: 2,
      kills: 3,
      deaths: 1,
      assists: 4,
      teamKills: 8,
      damageToPlayer: 12_500,
      victory: true,
      rpAfter: 4200,
      rpDelta: 35,
    })
    expect(input.rawJson).toBeUndefined()
  })

  it('toPlayerMatchInput — rpAfter/rpDelta/teamKills 없으면 null', () => {
    const input = toPlayerMatchInput(
      'uid-a',
      baseMatch({
        rpAfter: undefined,
        rpDelta: undefined,
        teamKills: undefined,
        damageToPlayers: undefined,
        playerDamage: undefined,
      }),
      { apiSeasonId: 39 },
    )

    expect(input.rpAfter).toBeNull()
    expect(input.rpDelta).toBeNull()
    expect(input.teamKills).toBeNull()
    expect(input.damageToPlayer).toBeNull()
  })

  it('toPlayerMatchInput — characterName 없으면 null', () => {
    const input = toPlayerMatchInput(
      'uid-a',
      baseMatch({ characterName: '' }),
      { apiSeasonId: 39 },
    )

    expect(input.characterName).toBeNull()
  })

  it('toPlayerMatchInput — storeRawJson=true일 때만 rawJson 저장', () => {
    const withRaw = toPlayerMatchInput('uid-a', baseMatch(), {
      apiSeasonId: 39,
      storeRawJson: true,
      rawJson: { gameId: 1001 },
    })
    const withoutRaw = toPlayerMatchInput('uid-a', baseMatch(), {
      apiSeasonId: 39,
      storeRawJson: false,
      rawJson: { gameId: 1001 },
    })

    expect(withRaw.rawJson).toEqual({ gameId: 1001 })
    expect(withoutRaw.rawJson).toBeUndefined()
  })

  it('upsertPlayerMatches — 새 경기를 저장한다', async () => {
    const { prisma, rows } = createInMemoryPlayerMatchPrisma()

    const count = await upsertPlayerMatches(
      prisma,
      'uid-a',
      [baseMatch({ matchId: '2001' }), baseMatch({ matchId: '2002' })],
      { apiSeasonId: 39, displaySeasonId: 11 },
    )

    expect(count).toBe(2)
    expect(rows.size).toBe(2)
    expect(await hasPlayerMatch(prisma, 'uid-a', '2001')).toBe(true)
  })

  it('upsertPlayerMatches — 같은 uid + gameId 재upsert 시 중복 row 없음', async () => {
    const { prisma, rows } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(prisma, 'uid-a', [baseMatch({ kills: 1 })], {
      apiSeasonId: 39,
    })
    await upsertPlayerMatches(prisma, 'uid-a', [baseMatch({ kills: 9 })], {
      apiSeasonId: 39,
    })

    expect(rows.size).toBe(1)
    expect(rows.get('uid-a:1001')?.kills).toBe(9)
  })

  it('upsertPlayerMatches — uid가 다르면 같은 gameId도 별도 row', async () => {
    const { prisma, rows } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(prisma, 'uid-a', [baseMatch()], { apiSeasonId: 39 })
    await upsertPlayerMatches(prisma, 'uid-b', [baseMatch()], { apiSeasonId: 39 })

    expect(rows.size).toBe(2)
    expect(rows.has('uid-a:1001')).toBe(true)
    expect(rows.has('uid-b:1001')).toBe(true)
  })

  it('readPlayerMatchesForSeason — apiSeasonId + gameMode=rank만 반환', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [
        baseMatch({ matchId: 'r1', gameMode: 'rank', gameStartedAt: '2026-06-12T00:00:00.000Z' }),
        baseMatch({ matchId: 'n1', gameMode: 'normal', gameStartedAt: '2026-06-11T00:00:00.000Z' }),
        baseMatch({ matchId: 'r2', gameMode: 'rank', gameStartedAt: '2026-06-10T00:00:00.000Z' }),
      ],
      { apiSeasonId: 39 },
    )
    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [baseMatch({ matchId: 'old', gameMode: 'rank', gameStartedAt: '2026-05-01T00:00:00.000Z' })],
      { apiSeasonId: 38 },
    )

    const rankOnly = await readPlayerMatchesForSeason(prisma, {
      uid: 'uid-a',
      apiSeasonId: 39,
      gameMode: 'rank',
    })

    expect(rankOnly.map((row) => row.gameId)).toEqual(['r1', 'r2'])
  })

  it('readPlayerMatchesForSeason — displaySeasonId 불일치여도 apiSeasonId로 읽는다', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [baseMatch({ matchId: 'm1' })],
      { apiSeasonId: 20, displaySeasonId: 20 },
    )

    const rows = await readPlayerMatchesForSeason(prisma, {
      uid: 'uid-a',
      apiSeasonId: 20,
      displaySeasonId: 11,
      gameMode: 'rank',
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.gameId).toBe('m1')
  })

  it('readPlayerMatchesForSeason — playedAt desc 정렬 유지', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [
        baseMatch({ matchId: 'm1', gameStartedAt: '2026-06-01T00:00:00.000Z' }),
        baseMatch({ matchId: 'm2', gameStartedAt: '2026-06-03T00:00:00.000Z' }),
        baseMatch({ matchId: 'm3', gameStartedAt: '2026-06-02T00:00:00.000Z' }),
      ],
      { apiSeasonId: 39 },
    )

    const rows = await readPlayerMatchesForSeason(prisma, {
      uid: 'uid-a',
      apiSeasonId: 39,
      gameMode: 'all',
    })

    expect(rows.map((row) => row.gameId)).toEqual(['m2', 'm3', 'm1'])
  })

  it('countPlayerMatchesForSeason — rank count 정확', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [
        baseMatch({ matchId: 'r1', gameMode: 'rank' }),
        baseMatch({ matchId: 'r2', gameMode: 'rank' }),
        baseMatch({ matchId: 'n1', gameMode: 'normal' }),
      ],
      { apiSeasonId: 39 },
    )

    await expect(
      countPlayerMatchesForSeason(prisma, {
        uid: 'uid-a',
        apiSeasonId: 39,
        gameMode: 'rank',
      }),
    ).resolves.toBe(2)
  })

  it('getLatestPlayerMatch — 최신 rank 경기 반환', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [
        baseMatch({ matchId: 'old', gameStartedAt: '2026-06-01T00:00:00.000Z' }),
        baseMatch({ matchId: 'new', gameStartedAt: '2026-06-05T00:00:00.000Z' }),
      ],
      { apiSeasonId: 39 },
    )

    await expect(
      getLatestPlayerMatch(prisma, { uid: 'uid-a', apiSeasonId: 39, gameMode: 'rank' }),
    ).resolves.toMatchObject({ gameId: 'new' })
  })

  it('upsertPlayerMatches — delegate 미준비 시 0 반환', async () => {
    const prisma = {} as PrismaClient

    await expect(
      upsertPlayerMatches(prisma, 'uid-a', [baseMatch()], { apiSeasonId: 39 }),
    ).resolves.toBe(0)
  })

  it('resolvePlayerMatchStoreContext — seasonNumber가 display season이면 apiIdForDisplay로 매핑', () => {
    const catalog = {
      displayForApiId: (apiSeasonId: number) => (apiSeasonId === 20 ? 11 : apiSeasonId - 9),
      apiIdForDisplay: (displaySeason: number) => (displaySeason === 11 ? 20 : displaySeason + 9),
    } as unknown as SeasonCatalog

    const context = resolvePlayerMatchStoreContext({
      match: baseMatch({ seasonNumber: 11 }),
      catalog,
    })

    expect(context).toEqual({
      apiSeasonId: 20,
      displaySeasonId: 11,
      matchingMode: null,
      matchingTeamMode: null,
    })
  })

  it('resolvePlayerMatchStoreContext — seasonNumber가 apiSeasonId일 때 catalog로 display 매핑', () => {
    const catalog = {
      displayForApiId: (apiSeasonId: number) => (apiSeasonId === 20 ? 11 : null),
      apiIdForDisplay: (displaySeason: number) => (displaySeason === 11 ? 20 : null),
    } as unknown as SeasonCatalog

    const context = resolvePlayerMatchStoreContext({
      match: baseMatch({ seasonNumber: 20 }),
      catalog,
      matchingMode: 3,
      matchingTeamMode: 3,
    })

    expect(context).toEqual({
      apiSeasonId: 20,
      displaySeasonId: 11,
      matchingMode: 3,
      matchingTeamMode: 3,
    })
  })

  it('resolvePlayerMatchStoreContext — catalog 없으면 skip', () => {
    expect(
      resolvePlayerMatchStoreContext({
        match: baseMatch({ seasonNumber: 11 }),
        catalog: null,
      }),
    ).toBeNull()
  })

  it('upsertFreshPlayerMatches — context 불확실한 match는 skip', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()

    const result = await upsertFreshPlayerMatches(
      prisma,
      'uid-a',
      [{ match: baseMatch({ seasonNumber: undefined }) }],
      { catalog: null },
    )

    expect(result).toEqual({ upserted: 0, skipped: 1, failed: false })
  })

  it('toMatchSummaryFromPlayerMatch — MatchSummaryContract 호환 필드 유지', () => {
    const summary = toMatchSummaryFromPlayerMatch(
      {
        uid: 'uid-a',
        apiSeasonId: 20,
        displaySeasonId: 11,
        gameId: '1001',
        gameMode: 'rank',
        playedAt: new Date('2026-06-10T12:00:00.000Z'),
        characterNum: 19,
        characterName: '엠마',
        placement: 2,
        kills: 3,
        deaths: 1,
        assists: 4,
        teamKills: 8,
        damageToPlayer: 12_500,
        victory: true,
        rpAfter: 4200,
        rpDelta: 35,
      },
      42,
    )

    expect(summary).toMatchObject({
      matchId: '1001',
      userNum: 42,
      characterNum: 19,
      characterName: '엠마',
      placement: 2,
      kills: 3,
      deaths: 1,
      assists: 4,
      gameStartedAt: '2026-06-10T12:00:00.000Z',
      victory: true,
      seasonNumber: 11,
      rpAfter: 4200,
      rpDelta: 35,
      teamKills: 8,
      damageToPlayers: 12_500,
      playerDamage: 12_500,
      gameMode: 'rank',
    })
  })

  it('readMatchesPageFromPlayerMatch — offset/limit page slice', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()

    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [
        baseMatch({ matchId: '1', gameStartedAt: '2026-06-03T00:00:00.000Z' }),
        baseMatch({ matchId: '2', gameStartedAt: '2026-06-02T00:00:00.000Z' }),
        baseMatch({ matchId: '3', gameStartedAt: '2026-06-01T00:00:00.000Z' }),
      ],
      { apiSeasonId: 39, displaySeasonId: 11 },
    )

    const page = await readMatchesPageFromPlayerMatch(prisma, {
      uid: 'uid-a',
      userNum: 42,
      apiSeasonId: 39,
      displaySeasonId: 11,
      mode: 'rank',
      offset: 1,
      limit: 1,
    })

    expect(page.totalCount).toBe(3)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.matchId).toBe('2')
  })

  it('toPlayerMatchInput — accountLevel, characterLevel, skinCode 저장', () => {
    const input = toPlayerMatchInput('uid-a', loadoutMatch(), { apiSeasonId: 39, displaySeasonId: 11 })

    expect(input.accountLevel).toBe(510)
    expect(input.characterLevel).toBe(20)
    expect(input.skinCode).toBe(1_056_002)
  })

  it('toPlayerMatchInput — loadout 필드 저장', () => {
    const input = toPlayerMatchInput('uid-a', loadoutMatch(), { apiSeasonId: 39, displaySeasonId: 11 })

    expect(input.bestWeapon).toBe(20)
    expect(input.tacticalSkillGroup).toBe(120)
    expect(input.traitFirstCore).toBe(7_100_101)
    expect(input.traitFirstSub).toEqual([7_110_701, 7_110_601])
    expect(input.traitSecondSub).toEqual([7_310_201, 7_310_301])
    expect(input.equipment).toEqual({ '0': 119_503, '1': 202_503 })
    expect(input.equipmentGrade).toEqual({ '0': 5, '1': 5 })
    expect(input.routeIdOfStart).toBe(7143)
    expect(input.routeSlotId).toBe(0)
  })

  it('toMatchSummaryFromPlayerMatch — loadout 필드 복원', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()
    await upsertPlayerMatches(prisma, 'uid-a', [loadoutMatch({ matchId: '9001' })], {
      apiSeasonId: 39,
      displaySeasonId: 11,
    })

    const rows = await readPlayerMatchesForSeason(prisma, {
      uid: 'uid-a',
      apiSeasonId: 39,
      displaySeasonId: 11,
      gameMode: 'rank',
    })
    const summary = toMatchSummaryFromPlayerMatch(rows[0]!, 42)

    expect(summary.bestWeapon).toBe(20)
    expect(summary.tacticalSkillGroup).toBe(120)
    expect(summary.traitFirstCore).toBe(7_100_101)
    expect(summary.traitFirstSub).toEqual([7_110_701, 7_110_601])
    expect(summary.equipment).toEqual({ '0': 119_503, '1': 202_503 })
    expect(summary.routeIdOfStart).toBe(7143)
    expect(summary.accountLevel).toBe(510)
    expect(summary.characterLevel).toBe(20)
    expect(summary.skinCode).toBe(1_056_002)
  })

  it('repairPlayerMatchDetailsFromSources — stripped row를 cache source로 update', async () => {
    const { prisma, rows } = createInMemoryPlayerMatchPrisma()
    await upsertPlayerMatches(prisma, 'uid-a', [baseMatch({ matchId: '1001' })], {
      apiSeasonId: 39,
      displaySeasonId: 11,
    })

    expect(matchSummaryMissingLoadoutDetail(toMatchSummaryFromPlayerMatch(rows.get('uid-a:1001')!, 42))).toBe(
      true,
    )

    const updated = await repairPlayerMatchDetailsFromSources(prisma, {
      uid: 'uid-a',
      canonicalUserNum: uidToUserNum('uid-a'),
      apiSeasonId: 39,
      displaySeasonId: 11,
      targets: [baseMatch({ matchId: '1001', userNum: uidToUserNum('uid-a') })],
      sources: [loadoutMatch({ matchId: '1001', userNum: uidToUserNum('uid-a') })],
    })

    expect(updated).toBe(1)
    expect(rows.size).toBe(1)
    const restored = toMatchSummaryFromPlayerMatch(rows.get('uid-a:1001')!, 42)
    expect(restored.bestWeapon).toBe(20)
    expect(restored.characterLevel).toBe(20)
    expect(matchSummaryHasLoadoutDetail(restored)).toBe(true)
  })

  it('toPlayerMatchInput / toMatchSummaryFromPlayerMatch — gameDuration 저장·복원', async () => {
    const input = toPlayerMatchInput('uid-a', baseMatch({ gameDuration: 1234 }), {
      apiSeasonId: 39,
      displaySeasonId: 11,
    })
    expect(input.gameDuration).toBe(1234)

    const { prisma, rows } = createInMemoryPlayerMatchPrisma()
    await upsertPlayerMatches(prisma, 'uid-a', [baseMatch({ gameDuration: 1234 })], {
      apiSeasonId: 39,
      displaySeasonId: 11,
    })
    const restored = toMatchSummaryFromPlayerMatch(rows.get('uid-a:1001')!, 42)
    expect(restored.gameDuration).toBe(1234)
  })

  it('repairPlayerMatchDetailsFromSources — stripped row의 gameDuration을 source로 update', async () => {
    const { prisma, rows } = createInMemoryPlayerMatchPrisma()
    await upsertPlayerMatches(prisma, 'uid-a', [baseMatch({ matchId: '1001' })], {
      apiSeasonId: 39,
      displaySeasonId: 11,
    })

    const updated = await repairPlayerMatchDetailsFromSources(prisma, {
      uid: 'uid-a',
      canonicalUserNum: uidToUserNum('uid-a'),
      apiSeasonId: 39,
      displaySeasonId: 11,
      targets: [baseMatch({ matchId: '1001', userNum: uidToUserNum('uid-a') })],
      sources: [baseMatch({ matchId: '1001', gameDuration: 987, userNum: uidToUserNum('uid-a') })],
    })

    expect(updated).toBe(1)
    expect(toMatchSummaryFromPlayerMatch(rows.get('uid-a:1001')!, 42).gameDuration).toBe(987)
  })

  it('cobaltInfusions 저장·복원', async () => {
    const { prisma, rows } = createInMemoryPlayerMatchPrisma()
    await upsertPlayerMatches(
      prisma,
      'uid-a',
      [baseMatch({ gameMode: 'cobalt', cobaltInfusions: [7000201, 7000401] })],
      { apiSeasonId: 39, displaySeasonId: 11 },
    )
    const restored = toMatchSummaryFromPlayerMatch(rows.get('uid-a:1001')!, 42, {
      tierId: 'gold-4',
      tierNameKo: '골드',
      tierNameEn: 'Gold',
      division: 4,
      minRp: 0,
      maxRp: null,
      isLeaderboardTier: false,
      displayLabel: '골드 4',
    })
    expect(restored.cobaltInfusions).toEqual([7000201, 7000401])
    expect(restored.matchGrade).toBeUndefined()
    expect(restored.matchGradeScore).toBeUndefined()
    expect(restored.gradeLabel).toBeUndefined()
  })

  it('저장 gameMode가 normal이어도 matchingMode 6이면 cobalt로 복원', () => {
    const row = {
      uid: 'uid-a',
      apiSeasonId: 39,
      displaySeasonId: 11,
      gameId: '1001',
      gameMode: 'normal',
      matchingMode: 6,
      playedAt: new Date('2026-06-01T00:00:00.000Z'),
      characterNum: 1,
      characterName: '재키',
      placement: 1,
      kills: 3,
      deaths: 0,
      assists: 2,
      teamKills: 5,
      damageToPlayer: 1000,
      victory: true,
      rpAfter: null,
      rpDelta: null,
      cobaltInfusions: [13],
    } as PlayerMatchRow

    expect(toMatchSummaryFromPlayerMatch(row, 42).gameMode).toBe('cobalt')
  })

  it('matchingMode 2 + cobaltInfusions면 cobalt로 복원', () => {
    const row = {
      uid: 'uid-a',
      apiSeasonId: 39,
      displaySeasonId: 11,
      gameId: '1002',
      gameMode: 'normal',
      matchingMode: 2,
      playedAt: new Date('2026-06-01T00:00:00.000Z'),
      characterNum: 1,
      characterName: '재키',
      placement: 1,
      kills: 3,
      deaths: 0,
      assists: 2,
      teamKills: 5,
      damageToPlayer: 1000,
      victory: true,
      rpAfter: null,
      rpDelta: null,
      cobaltInfusions: [7000201],
    } as PlayerMatchRow

    expect(toMatchSummaryFromPlayerMatch(row, 42).gameMode).toBe('cobalt')
  })

  it('rawJson.finalInfusion으로 cobaltInfusions 보강', () => {
    const row = {
      uid: 'uid-a',
      apiSeasonId: 39,
      displaySeasonId: 11,
      gameId: '1003',
      gameMode: 'normal',
      matchingMode: 2,
      playedAt: new Date('2026-06-01T00:00:00.000Z'),
      characterNum: 1,
      characterName: '재키',
      placement: 1,
      kills: 3,
      deaths: 0,
      assists: 2,
      teamKills: 5,
      damageToPlayer: 1000,
      victory: true,
      rpAfter: null,
      rpDelta: null,
      cobaltInfusions: null,
      rawJson: { finalInfusion: [7000401, 7000501] },
    } as PlayerMatchRow

    const restored = toMatchSummaryFromPlayerMatch(row, 42)
    expect(restored.gameMode).toBe('cobalt')
    expect(restored.cobaltInfusions).toEqual([7000401, 7000501])
  })

  it('traitSecondSub 코발트 productCode가 finalInfusion apiCode보다 우선', () => {
    const row = {
      uid: 'uid-a',
      apiSeasonId: 39,
      displaySeasonId: 11,
      gameId: '61946355',
      gameMode: 'cobalt',
      matchingMode: 6,
      playedAt: new Date('2026-06-01T00:00:00.000Z'),
      characterNum: 78,
      characterName: '영타이거',
      placement: 1,
      kills: 3,
      deaths: 0,
      assists: 2,
      teamKills: 5,
      damageToPlayer: 1000,
      victory: true,
      rpAfter: null,
      rpDelta: null,
      cobaltInfusions: [64, 62, 78],
      traitSecondSub: [7922602, 7922402, 7923602],
      rawJson: {
        finalInfusion: [64, 62, 78],
        traitSecondSub: [7922602, 7922402, 7923602],
      },
    } as PlayerMatchRow

    const restored = toMatchSummaryFromPlayerMatch(row, 42)
    expect(restored.cobaltInfusions).toEqual([7922602, 7922402])
  })
})

describe('player match ownership 39.38C', () => {
  const MINE_UID = 'mine-profile-uid'
  const HAYING_UID = 'haying-profile-uid'
  const SHARED_GAME = '61824592'

  it('readMatchesPageFromVerifiedSources ignores teammate alias rows', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()
    const cobalt = (uid: string, characterNum: number, kills: number): MatchSummaryContract => ({
      matchId: SHARED_GAME,
      userNum: uidToUserNum(uid),
      characterNum,
      characterName: `char-${characterNum}`,
      placement: 1,
      kills,
      deaths: 0,
      assists: 0,
      gameStartedAt: '2026-06-20T00:00:00.000Z',
      victory: true,
      gameMode: 'cobalt',
      cobaltInfusions: [7000201],
    })
    await upsertPlayerMatches(prisma, HAYING_UID, [cobalt(HAYING_UID, 30, 11)], {
      apiSeasonId: 39,
      displaySeasonId: 20,
      matchingMode: 6,
    })

    const minePage = await readMatchesPageFromVerifiedSources(prisma, {
      uid: MINE_UID,
      canonicalUid: MINE_UID,
      aliasUids: [HAYING_UID],
      userNum: uidToUserNum(MINE_UID),
      apiSeasonId: 39,
      displaySeasonId: 20,
      mode: 'cobalt',
      offset: 0,
      limit: 10,
    })
    expect(minePage.items).toHaveLength(0)
  })

  it('readMatchesPageFromVerifiedSources reads owner uid only', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()
    const cobalt = (uid: string, characterNum: number): MatchSummaryContract => ({
      matchId: SHARED_GAME,
      userNum: uidToUserNum(uid),
      characterNum,
      characterName: `char-${characterNum}`,
      placement: 1,
      kills: characterNum,
      deaths: 0,
      assists: 0,
      gameStartedAt: '2026-06-20T00:00:00.000Z',
      victory: true,
      gameMode: 'cobalt',
      cobaltInfusions: [7000201],
    })
    await upsertPlayerMatches(prisma, MINE_UID, [cobalt(MINE_UID, 6)], {
      apiSeasonId: 39,
      displaySeasonId: 20,
      matchingMode: 6,
    })
    await upsertPlayerMatches(prisma, HAYING_UID, [cobalt(HAYING_UID, 30)], {
      apiSeasonId: 39,
      displaySeasonId: 20,
      matchingMode: 6,
    })

    const minePage = await readMatchesPageFromVerifiedSources(prisma, {
      uid: MINE_UID,
      canonicalUid: MINE_UID,
      userNum: uidToUserNum(MINE_UID),
      apiSeasonId: 39,
      displaySeasonId: 20,
      mode: 'cobalt',
      offset: 0,
      limit: 10,
    })
    expect(minePage.items[0]?.characterNum).toBe(6)

    const hayingPage = await readMatchesPageFromVerifiedSources(prisma, {
      uid: HAYING_UID,
      canonicalUid: HAYING_UID,
      userNum: uidToUserNum(HAYING_UID),
      apiSeasonId: 39,
      displaySeasonId: 20,
      mode: 'cobalt',
      offset: 0,
      limit: 10,
    })
    expect(hayingPage.items[0]?.characterNum).toBe(30)
  })

  it('repairPlayerMatchDetailsFromSources skips foreign participant rows', async () => {
    const { prisma } = createInMemoryPlayerMatchPrisma()
    const target: MatchSummaryContract = {
      matchId: SHARED_GAME,
      userNum: uidToUserNum(MINE_UID),
      characterNum: 6,
      characterName: '나딘',
      placement: 1,
      kills: 1,
      deaths: 0,
      assists: 0,
      gameStartedAt: new Date().toISOString(),
      victory: true,
      gameMode: 'cobalt',
    }
    const updated = await repairPlayerMatchDetailsFromSources(prisma, {
      uid: MINE_UID,
      canonicalUserNum: uidToUserNum(MINE_UID),
      apiSeasonId: 39,
      displaySeasonId: 20,
      targets: [target],
      sources: [{ ...target, userNum: uidToUserNum(HAYING_UID), characterNum: 30, bestWeapon: 101 }],
    })
    expect(updated).toBe(0)
  })
})
