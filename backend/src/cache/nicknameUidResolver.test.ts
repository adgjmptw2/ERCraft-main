import { describe, expect, it, vi, beforeEach } from 'vitest'

import { resolveCanonicalUidForNickname } from './nicknameUidResolver.js'

function squadStat(totalGames: number, mmr: number, nickname?: string) {
  return {
    seasonId: 39,
    matchingMode: 3,
    matchingTeamMode: 3,
    mmr,
    nickname,
    rank: 1,
    rankSize: 100,
    totalGames,
    totalWins: 10,
    totalTeamKills: 0,
    totalDeaths: 0,
    averageRank: 5,
    averageKills: 1,
    averageAssistants: 1,
    top1: 0,
    top3: 0,
  }
}

function createPrismaMock(options: {
  participantUids?: Array<{ uid: string; nickname?: string }>
  backfillByUid?: Record<
    string,
    Array<{ status: string; collectedGames: number; officialSeasonGames: number | null; apiSeasonId?: number }>
  >
  rankCountByUid?: Record<string, number>
  rankCountByUidSeason?: Record<string, number>
  statsCacheByUid?: Record<string, unknown>
  aggregateStatusByUid?: Record<string, string>
}) {
  const participantUids = options.participantUids ?? []
  const backfillByUid = options.backfillByUid ?? {}
  const rankCountByUid = options.rankCountByUid ?? {}
  const rankCountByUidSeason = options.rankCountByUidSeason ?? {}
  const statsCacheByUid = options.statsCacheByUid ?? {}
  const aggregateStatusByUid = options.aggregateStatusByUid ?? {}

  return {
    matchParticipant: {
      findMany: vi.fn(async () => participantUids),
    },
    profileNicknameBinding: {
      findUnique: vi.fn(async () => null),
      delete: vi.fn(async () => ({})),
    },
    profileIdentityAlias: {
      findMany: vi.fn(async () => []),
    },
    playerSeasonBackfillState: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const sep = where.id.lastIndexOf(':')
        const uid = where.id.slice(0, sep)
        const apiSeasonId = Number(where.id.slice(sep + 1))
        const row = (backfillByUid[uid] ?? []).find((r) => (r.apiSeasonId ?? 39) === apiSeasonId)
        if (!row) return null
        return {
          uid,
          apiSeasonId,
          status: row.status,
          collectedGames: row.collectedGames,
          officialSeasonGames: row.officialSeasonGames,
        }
      }),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { uid?: string; status?: string; apiSeasonId?: number }
        }) => {
          if (where.uid) {
            return (backfillByUid[where.uid] ?? []).map((row) => ({
              collectedGames: row.collectedGames,
              officialSeasonGames: row.officialSeasonGames,
              status: row.status,
            }))
          }
          const rows: Array<{ uid: string; apiSeasonId: number; collectedGames: number; status: string }> = []
          for (const [uid, states] of Object.entries(backfillByUid)) {
            for (const state of states) {
              if (where.status && state.status !== where.status) continue
              if (where.apiSeasonId !== undefined && (state.apiSeasonId ?? 39) !== where.apiSeasonId) {
                continue
              }
              rows.push({
                uid,
                apiSeasonId: state.apiSeasonId ?? 39,
                collectedGames: state.collectedGames,
                status: state.status,
              })
            }
          }
          return rows
        },
      ),
    },
    playerMatch: {
      count: vi.fn(
        async ({
          where,
        }: {
          where: { uid: string; gameMode?: string; apiSeasonId?: number }
        }) => {
          if (where.apiSeasonId !== undefined) {
            return rankCountByUidSeason[`${where.uid}:${where.apiSeasonId}`] ?? 0
          }
          return rankCountByUid[where.uid] ?? 0
        },
      ),
    },
    seasonStatsCache: {
      findMany: vi.fn(async () =>
        Object.entries(statsCacheByUid).map(([uid, data]) => ({
          id: `${uid}:39`,
          data,
        })),
      ),
    },
    seasonAggregateCache: {
      findMany: vi.fn(async () =>
        Object.entries(aggregateStatusByUid).map(([uid, cacheStatus]) => ({
          uid,
          cacheStatus,
        })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const uid = where.id.split(':')[0]
        const status = aggregateStatusByUid[uid]
        if (!status) return null
        return {
          userNum: BigInt(1),
          displaySeasonId: 11,
          apiSeasonId: 39,
          cacheStatus: status,
          characterStats: [{ characterNum: 1, games: 10, wins: 1, winRate: 10, kills: 1, assists: 0, deaths: 0 }],
          rpSeries: [{ dateLabel: '06/01', rpAfter: 6000 }],
          lastRefreshedAt: new Date(),
          expiresAt: null,
        }
      }),
    },
  }
}

describe('resolveCanonicalUidForNickname', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('BSER uid만 있으면 그대로 사용', async () => {
    const prisma = createPrismaMock({})
    const result = await resolveCanonicalUidForNickname(prisma as never, 'fencing', 'uid-bser')
    expect(result.uid).toBe('uid-bser')
    expect(result.swapped).toBe(false)
  })

  it('DB에 complete backfill uid가 있으면 BSER uid보다 우선', async () => {
    const prisma = createPrismaMock({
      participantUids: [{ uid: 'uid-complete', nickname: 'fencing' }],
      backfillByUid: {
        'uid-bser': [{ status: 'complete', collectedGames: 20, officialSeasonGames: 48, apiSeasonId: 39 }],
        'uid-complete': [{ status: 'complete', collectedGames: 48, officialSeasonGames: 48, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-bser:39': 20,
        'uid-complete:39': 48,
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, 'fencing', 'uid-bser', {
      apiSeasonId: 39,
    })

    expect(result.uid).toBe('uid-complete')
    expect(result.swapped).toBe(true)
  })

  it('DB uid가 partial이면 BSER uid 유지', async () => {
    const prisma = createPrismaMock({
      participantUids: [{ uid: 'uid-partial', nickname: 'fencing' }],
      backfillByUid: {
        'uid-bser': [{ status: 'running', collectedGames: 20, officialSeasonGames: 48, apiSeasonId: 39 }],
        'uid-partial': [{ status: 'partial', collectedGames: 10, officialSeasonGames: 48, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-bser:39': 20,
        'uid-partial:39': 10,
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, 'fencing', 'uid-bser', {
      apiSeasonId: 39,
    })

    expect(result.uid).toBe('uid-bser')
    expect(result.swapped).toBe(false)
  })

  it('same userNum multiple uid — complete old uid가 canonical', async () => {
    const prisma = createPrismaMock({
      statsCacheByUid: {
        'uid-old': [squadStat(800, 6500, '연서')],
        'uid-new': [squadStat(800, 6500)],
      },
      backfillByUid: {
        'uid-old': [{ status: 'complete', collectedGames: 800, officialSeasonGames: 800, apiSeasonId: 39 }],
        'uid-new': [{ status: 'running', collectedGames: 0, officialSeasonGames: 800, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-old:39': 800,
        'uid-new:39': 0,
      },
      aggregateStatusByUid: {
        'uid-old': 'ready',
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, '연서', 'uid-new', {
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 800, mmr: 6500 },
    })

    expect(result.uid).toBe('uid-old')
    expect(result.swapped).toBe(true)
  })

  it('same userNum multiple uid — match 많은 old uid 선택', async () => {
    const prisma = createPrismaMock({
      statsCacheByUid: {
        'uid-rich': [squadStat(300, 5000, '연서')],
        'uid-new': [squadStat(300, 5000)],
      },
      backfillByUid: {
        'uid-rich': [{ status: 'partial', collectedGames: 300, officialSeasonGames: 800, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-rich:39': 300,
        'uid-new:39': 0,
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, '연서', 'uid-new', {
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 300, mmr: 5000 },
    })

    expect(result.uid).toBe('uid-rich')
    expect(result.swapped).toBe(true)
  })

  it('different userNum guard — nickname/mmr 불일치면 공유하지 않음', async () => {
    const prisma = createPrismaMock({
      statsCacheByUid: {
        'uid-other': [squadStat(800, 6500, '다른유저')],
      },
      backfillByUid: {
        'uid-other': [{ status: 'complete', collectedGames: 800, officialSeasonGames: 800, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-other:39': 800,
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, '연서', 'uid-bser', {
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 800, mmr: 6500 },
    })

    expect(result.uid).toBe('uid-bser')
    expect(result.swapped).toBe(false)
  })

  it('season guard — 다른 apiSeasonId complete는 사용하지 않음', async () => {
    const prisma = createPrismaMock({
      participantUids: [{ uid: 'uid-old-season', nickname: 'fencing' }],
      backfillByUid: {
        'uid-old-season': [{ status: 'complete', collectedGames: 48, officialSeasonGames: 48, apiSeasonId: 38 }],
        'uid-bser': [{ status: 'running', collectedGames: 5, officialSeasonGames: 48, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-old-season:38': 48,
        'uid-bser:39': 5,
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, 'fencing', 'uid-bser', {
      apiSeasonId: 39,
    })

    expect(result.uid).toBe('uid-bser')
    expect(result.swapped).toBe(false)
  })

  it('cold start — in-memory 없이 DB fingerprint만으로 canonical 복구', async () => {
    const prisma = createPrismaMock({
      statsCacheByUid: {
        'uid-stored': [squadStat(48, 6100, 'fencing')],
      },
      backfillByUid: {
        'uid-stored': [{ status: 'complete', collectedGames: 48, officialSeasonGames: 48, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-stored:39': 48,
        'uid-bser:39': 0,
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, 'fencing', 'uid-bser', {
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 48, mmr: 6100 },
    })

    expect(result.uid).toBe('uid-stored')
    expect(result.swapped).toBe(true)
  })

  it('untrusted nickname binding — BSER uid alias 없으면 binding 무시', async () => {
    const prisma = createPrismaMock({})
    prisma.profileNicknameBinding.findUnique = vi.fn(async () => ({
      canonicalUid: 'uid-wrong',
      canonicalUserNum: BigInt(999),
    })) as never
    prisma.profileIdentityAlias.findMany = vi.fn(async () => [])
    prisma.profileNicknameBinding.delete = vi.fn(async () => ({}))

    const result = await resolveCanonicalUidForNickname(prisma as never, 'player-a', 'uid-bser', {
      apiSeasonId: 39,
    })

    expect(result.uid).toBe('uid-bser')
    expect(result.swapped).toBe(false)
    expect(prisma.profileNicknameBinding.delete).toHaveBeenCalled()
  })

  it('trusted nickname binding — verified alias가 있으면 canonical uid 사용', async () => {
    const prisma = createPrismaMock({})
    prisma.profileNicknameBinding.findUnique = vi.fn(async () => ({
      canonicalUid: 'uid-canonical',
      canonicalUserNum: BigInt(100),
    })) as never
    prisma.profileIdentityAlias.findMany = vi.fn(async () => [
      { sourceUid: 'uid-bser', verificationMethod: 'game-id-overlap' },
    ])

    const result = await resolveCanonicalUidForNickname(prisma as never, 'player-a', 'uid-bser', {
      apiSeasonId: 39,
    })

    expect(result.uid).toBe('uid-canonical')
    expect(result.swapped).toBe(true)
    expect(result.reason).toBe('nickname-binding')
  })

  it('fingerprint — nickname 없으면 후보에서 제외', async () => {
    const prisma = createPrismaMock({
      statsCacheByUid: {
        'uid-other': [squadStat(800, 6500)],
      },
      backfillByUid: {
        'uid-other': [{ status: 'complete', collectedGames: 800, officialSeasonGames: 800, apiSeasonId: 39 }],
      },
      rankCountByUidSeason: {
        'uid-other:39': 800,
      },
    })

    const result = await resolveCanonicalUidForNickname(prisma as never, 'player-a', 'uid-bser', {
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 800, mmr: 6500 },
    })

    expect(result.uid).toBe('uid-bser')
    expect(result.swapped).toBe(false)
  })
})
