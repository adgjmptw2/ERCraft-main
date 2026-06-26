import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bserMock = vi.hoisted(() => ({
  getGame: vi.fn(),
  getCharacterNames: vi.fn(),
  getSeasonRows: vi.fn(),
  isConfigured: true,
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

import { createApp } from '../app.js'
import { clearMatchDetailInflightForTests } from '../cache/matchDetailService.js'

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

function makeBserGame(gameId: number, overrides: Record<string, unknown> = {}) {
  return {
    gameId,
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
    nickname: `player-${gameId}`,
    teamNumber: 1,
    damageToPlayer: 10000,
    damageToMonster: 20000,
    damageFromPlayer: 5000,
    totalGainVFCredit: 800,
    bestWeapon: 9,
    tacticalSkillGroup: 120,
    traitFirstCore: 7100101,
    traitFirstSub: [7110701],
    traitSecondSub: [7310201],
    equipment: { '0': 119503 },
    equipmentGrade: { '0': 5 },
    ...overrides,
  }
}

function createMatchDetailPrisma(store: Map<string, { detail: StoredDetail; participants: StoredParticipant[] }>) {
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
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(createMatchDetailPrisma(store)),
  }
}

describe('matches routes', () => {
  let app: FastifyInstance
  let store: Map<string, { detail: StoredDetail; participants: StoredParticipant[] }>

  beforeEach(async () => {
    vi.clearAllMocks()
    clearMatchDetailInflightForTests()
    process.env.BSER_API_KEY = 'test-key'
    store = new Map()

    bserMock.getCharacterNames.mockResolvedValue(new Map([[1, '유키']]))
    bserMock.getGame.mockResolvedValue([
      makeBserGame(1001, { gameRank: 1, teamNumber: 2, nickname: 'alpha' }),
      makeBserGame(1001, { gameRank: 1, teamNumber: 2, nickname: 'beta', characterNum: 2 }),
      makeBserGame(1001, { gameRank: 5, teamNumber: 7, nickname: 'gamma', characterNum: 3 }),
    ])

    app = await createApp({
      prisma: createMatchDetailPrisma(store) as never,
    })
    await app.ready()
  })

  it('GET /matches/:gameId/detail — DB hit이면 BSER 호출 없음', async () => {
    store.set('1001', {
      detail: {
        gameId: '1001',
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
          gameId: '1001',
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
    })

    const res = await app.inject({ method: 'GET', url: '/api/matches/1001/detail' })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getGame).not.toHaveBeenCalled()
    expect(bserMock.getCharacterNames).not.toHaveBeenCalled()
    const body = res.json() as {
      data: { detailStatus: string; teams: unknown[] }
      fetchMeta?: { cacheHit: boolean }
    }
    expect(body.data.detailStatus).toBe('ready')
    expect(body.data.teams.length).toBeGreaterThan(0)
    expect(body.fetchMeta?.cacheHit).toBe(true)
  })

  it('GET /matches/:gameId/detail — DB miss이면 BSER 호출 후 저장', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/matches/1001/detail' })
    expect(res.statusCode).toBe(200)
    expect(bserMock.getGame).toHaveBeenCalledWith('1001')
    expect(store.get('1001')?.participants.length).toBe(3)
  })

  it('GET /matches/:gameId/detail — 동시 요청 inflight dedupe', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    bserMock.getGame.mockImplementation(async () => {
      await gate
      return [makeBserGame(2002)]
    })

    const first = app.inject({ method: 'GET', url: '/api/matches/2002/detail' })
    const second = app.inject({ method: 'GET', url: '/api/matches/2002/detail' })
    await vi.waitFor(() => expect(bserMock.getGame).toHaveBeenCalledTimes(1))
    release()
    await Promise.all([first, second])
    expect(bserMock.getGame).toHaveBeenCalledTimes(1)
  })

  it('GET /matches/:gameId/detail — BSER empty면 unavailable', async () => {
    bserMock.getGame.mockResolvedValueOnce([])
    const res = await app.inject({ method: 'GET', url: '/api/matches/9999/detail' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { detailStatus: string } }
    expect(body.data.detailStatus).toBe('unavailable')
  })
})
