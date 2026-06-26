import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearMatchDetailInflightForTests,
  isMatchDetailInflight,
  resolveMatchDetail,
} from './matchDetailService.js'
import { BserApiError, resetBserRequestLimiterForTests } from '../external/bserClient.js'

const bserMock = {
  getGame: vi.fn(),
}

interface StoredParticipant {
  id: bigint
  gameId: string
  uid: string | null
  nickname: string | null
  teamNumber: number | null
  teamRank: number | null
  placement: number | null
  characterNum: number
  characterName: string | null
  skinCode: number | null
  accountLevel: number | null
  characterLevel: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  teamKills: number | null
  damageToPlayer: number | null
  damageToMonster: number | null
  damageTaken: number | null
  credit: number | null
  rpAfter: number | null
  rpDelta: number | null
  bestWeapon: number | null
  tacticalSkillGroup: number | null
  traitFirstCore: number | null
  traitFirstSub: unknown
  traitSecondSub: unknown
  equipment: unknown
  equipmentGrade: unknown
  cobaltInfusions: unknown
}

interface StoredDetail {
  gameId: string
  apiSeasonId: number | null
  displaySeasonId: number | null
  gameMode: string
  matchingMode: number | null
  matchingTeamMode: number | null
  playedAt: Date
  durationSeconds: number | null
}

function createPrisma(store: Map<string, { detail: StoredDetail; participants: StoredParticipant[] }>) {
  let participantSeq = 1n
  return {
    matchDetail: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { gameId: string }
        include?: { participants?: unknown }
      }) => {
        const entry = store.get(where.gameId)
        if (!entry) return null
        if (include && 'participants' in include) {
          return { ...entry.detail, participants: entry.participants }
        }
        return entry.detail
      },
      upsert: async ({
        where,
        create,
      }: {
        where: { gameId: string }
        create: StoredDetail
      }) => {
        store.set(where.gameId, { detail: create, participants: store.get(where.gameId)?.participants ?? [] })
        return create
      },
    },
    matchParticipant: {
      deleteMany: async ({ where }: { where: { gameId: string } }) => {
        const entry = store.get(where.gameId)
        if (entry) entry.participants = []
        return { count: 1 }
      },
      createMany: async ({ data }: { data: Omit<StoredParticipant, 'id'>[] }) => {
        const entry = store.get(data[0]?.gameId ?? '')
        if (!entry) return { count: 0 }
        for (const row of data) {
          entry.participants.push({ ...row, id: participantSeq })
          participantSeq += 1n
        }
        return { count: data.length }
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(createPrisma(store)),
  }
}

function makeCachedRow(gameId: string): { detail: StoredDetail; participants: StoredParticipant[] } {
  return {
    detail: {
      gameId,
      apiSeasonId: 20,
      displaySeasonId: 11,
      gameMode: 'rank',
      matchingMode: 3,
      matchingTeamMode: 3,
      playedAt: new Date('2026-06-01T00:00:00Z'),
      durationSeconds: 1200,
    },
    participants: [
      {
        id: 1n,
        gameId,
        uid: null,
        nickname: 'cached',
        teamNumber: 1,
        teamRank: 1,
        placement: 1,
        characterNum: 1,
        characterName: '유키',
        skinCode: null,
        accountLevel: null,
        characterLevel: 10,
        kills: 2,
        deaths: 1,
        assists: 3,
        teamKills: null,
        damageToPlayer: 1000,
        damageToMonster: null,
        damageTaken: null,
        credit: null,
        rpAfter: 2400,
        rpDelta: 10,
        bestWeapon: 9,
        tacticalSkillGroup: 120,
        traitFirstCore: 7100101,
        traitFirstSub: [7110701],
        traitSecondSub: [7310201],
        equipment: { '0': 119503 },
        equipmentGrade: { '0': 5 },
        cobaltInfusions: null,
      },
    ],
  }
}

describe('resolveMatchDetail', () => {
  let store: Map<string, { detail: StoredDetail; participants: StoredParticipant[] }>

  beforeEach(() => {
    clearMatchDetailInflightForTests()
    resetBserRequestLimiterForTests()
    vi.clearAllMocks()
    store = new Map()
    bserMock.getGame.mockResolvedValue([
      {
        gameId: 3001,
        seasonId: 20,
        matchingMode: 3,
        matchingTeamMode: 3,
        characterNum: 1,
        characterLevel: 10,
        gameRank: 1,
        playerKill: 2,
        playerDeaths: 1,
        playerAssistant: 3,
        monsterKill: 5,
        victory: 1,
        startDtm: '2026-06-01T00:00:00Z',
        nickname: 'alpha',
        teamNumber: 1,
      },
    ])
  })

  it('DB cache hit — BSER getGame 0회, queue 대기 없음', async () => {
    store.set('1001', makeCachedRow('1001'))
    const resolveCharacterNames = vi.fn(async () => new Map([[1, '유키']]))

    const result = await resolveMatchDetail({
      prisma: createPrisma(store) as never,
      bser: bserMock as never,
      gameId: '1001',
      resolveCharacterNames,
    })

    expect(result.fetchMeta.cacheHit).toBe(true)
    expect(result.fetchMeta.queuedMs).toBe(0)
    expect(result.source).toBe('cache')
    expect(bserMock.getGame).not.toHaveBeenCalled()
    expect(resolveCharacterNames).not.toHaveBeenCalled()
  })

  it('같은 gameId 동시 요청 — getGame 1회, inflightShared, 완료 후 inflight 제거', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    bserMock.getGame.mockImplementation(async () => {
      await gate
      return [
        {
          gameId: 2002,
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 10,
          gameRank: 1,
          playerKill: 1,
          playerDeaths: 0,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: 'solo',
          teamNumber: 1,
        },
      ]
    })

    const params = {
      prisma: createPrisma(store) as never,
      bser: bserMock as never,
      gameId: '2002',
      resolveCharacterNames: async () => new Map([[1, '유키']]),
    }

    const first = resolveMatchDetail(params)
    const second = resolveMatchDetail(params)
    const third = resolveMatchDetail(params)

    await vi.waitFor(() => expect(bserMock.getGame).toHaveBeenCalledTimes(1))
    expect(isMatchDetailInflight('2002')).toBe(true)

    release()
    const [a, b, c] = await Promise.all([first, second, third])

    expect(a.detail.gameId).toBe('2002')
    expect(b.fetchMeta.inflightShared).toBe(true)
    expect(c.detail).toEqual(a.detail)
    expect(isMatchDetailInflight('2002')).toBe(false)
  })

  it('실패 후 inflight 제거 — 두 번째 요청이 upstream 재호출', async () => {
    bserMock.getGame
      .mockRejectedValueOnce(new BserApiError(504, 'BSER request timeout'))
      .mockResolvedValueOnce([
        {
          gameId: 4004,
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 10,
          gameRank: 1,
          playerKill: 1,
          playerDeaths: 0,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: 'retry',
          teamNumber: 1,
        },
      ])

    const params = {
      prisma: createPrisma(store) as never,
      bser: bserMock as never,
      gameId: '4004',
      resolveCharacterNames: async () => new Map([[1, '유키']]),
    }

    await expect(resolveMatchDetail(params)).rejects.toBeInstanceOf(BserApiError)
    expect(isMatchDetailInflight('4004')).toBe(false)

    const second = await resolveMatchDetail(params)
    expect(second.detail.gameId).toBe('4004')
    expect(bserMock.getGame).toHaveBeenCalledTimes(2)
  })

  it('서로 다른 gameId cache miss — 각각 getGame 1회 (limiter 순차는 bserClient)', async () => {
    const callOrder: string[] = []
    bserMock.getGame.mockImplementation(async (gameId: string) => {
      callOrder.push(String(gameId))
      return [
        {
          gameId: Number(gameId),
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 10,
          gameRank: 1,
          playerKill: 1,
          playerDeaths: 0,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: `p-${gameId}`,
          teamNumber: 1,
        },
      ]
    })

    const params = (gameId: string) => ({
      prisma: createPrisma(store) as never,
      bser: bserMock as never,
      gameId,
      resolveCharacterNames: async () => new Map([[1, '유키']]),
    })

    await Promise.all([
      resolveMatchDetail(params('5001')),
      resolveMatchDetail(params('5002')),
      resolveMatchDetail(params('5003')),
    ])

    expect(callOrder.sort()).toEqual(['5001', '5002', '5003'])
    expect(bserMock.getGame).toHaveBeenCalledTimes(3)
  })

  it('A 실패 후 B/C 진행', async () => {
    bserMock.getGame.mockImplementation(async (gameId: string) => {
      if (gameId === '6001') {
        throw new BserApiError(504, 'BSER request timeout')
      }
      return [
        {
          gameId: Number(gameId),
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 10,
          gameRank: 1,
          playerKill: 1,
          playerDeaths: 0,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: `p-${gameId}`,
          teamNumber: 1,
        },
      ]
    })

    const params = (gameId: string) => ({
      prisma: createPrisma(store) as never,
      bser: bserMock as never,
      gameId,
      resolveCharacterNames: async () => new Map([[1, '유키']]),
    })

    await expect(resolveMatchDetail(params('6001'))).rejects.toBeInstanceOf(BserApiError)
    const b = await resolveMatchDetail(params('6002'))
    const c = await resolveMatchDetail(params('6003'))

    expect(b.detail.gameId).toBe('6002')
    expect(c.detail.gameId).toBe('6003')
    expect(bserMock.getGame).toHaveBeenCalledTimes(3)
  })

  it('queue 대기 중 cache hit C — 즉시 반환, getGame 미호출', async () => {
    store.set('7003', makeCachedRow('7003'))

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    bserMock.getGame.mockImplementation(async () => {
      await gate
      return [
        {
          gameId: 7001,
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 10,
          gameRank: 1,
          playerKill: 1,
          playerDeaths: 0,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: 'queued',
          teamNumber: 1,
        },
      ]
    })

    const missParams = {
      prisma: createPrisma(store) as never,
      bser: bserMock as never,
      gameId: '7001',
      resolveCharacterNames: async () => new Map([[1, '유키']]),
    }
    const hitParams = {
      ...missParams,
      gameId: '7003',
    }

    const missPromise = resolveMatchDetail(missParams)
    await vi.waitFor(() => expect(bserMock.getGame).toHaveBeenCalledTimes(1))

    const hit = await resolveMatchDetail(hitParams)
    expect(hit.fetchMeta.cacheHit).toBe(true)
    expect(hit.source).toBe('cache')
    expect(bserMock.getGame).toHaveBeenCalledTimes(1)

    release()
    await missPromise
  })
})
