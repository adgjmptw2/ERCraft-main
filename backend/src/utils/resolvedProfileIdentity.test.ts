import { describe, expect, it } from 'vitest'

import { uidToUserNum } from '../external/bserMapper.js'
import {
  ProfileIdentityCache,
  resolveProfileIdentity,
  resolveVerifiedSourceUids,
} from './resolvedProfileIdentity.js'
import { buildCurrentSeasonCharacterStatsFromVerifiedSources } from '../cache/currentSeasonCharacterStats.js'
import { withSeasonsOwnerMetadata } from './seasonsOwner.js'

function createPrismaForIdentity(overrides: {
  canonicalUid: string
  aliasUid?: string
  fingerprintUid?: string
  gameOverlap?: boolean
  bootstrapGameIds?: string[]
  playerMatchRows?: Array<Record<string, unknown>>
  backfillRows?: Array<{ uid: string; collectedGames: number }>
}) {
  const {
    canonicalUid,
    aliasUid,
    fingerprintUid,
    gameOverlap = false,
    bootstrapGameIds = [],
    playerMatchRows = [],
    backfillRows = [],
  } = overrides

  const fingerprintRows =
    fingerprintUid !== undefined
      ? [
          {
            id: `${fingerprintUid}:39`,
            data: [
              {
                nickname: '연서',
                matchingTeamMode: 3,
                totalGames: 100,
                mmr: 2500,
              },
            ],
          },
        ]
      : []

  const allRows = [...playerMatchRows]
  if (bootstrapGameIds.length > 0 && aliasUid) {
    for (const gameId of bootstrapGameIds) {
      allRows.push({
        uid: aliasUid,
        gameId,
        gameMode: 'rank',
        apiSeasonId: 39,
        kills: 2,
        deaths: 1,
        assists: 1,
        teamKills: 4,
        damageToPlayer: 1000,
        playedAt: new Date(),
        characterNum: 1,
      })
    }
  }

  return {
    seasonStatsCache: {
      findMany: async () => fingerprintRows,
    },
    playerSeasonBackfillState: {
      findMany: async (args: { where?: { collectedGames?: number } }) => {
        if (args.where?.collectedGames !== undefined) {
          return backfillRows.filter((row) => row.collectedGames === args.where?.collectedGames)
        }
        return backfillRows
      },
      findUnique: async () => null,
    },
    playerMatch: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const where = args.where ?? {}
        if (where.gameId && typeof where.gameId === 'object' && 'in' in where.gameId) {
          const gameIds = (where.gameId as { in: string[] }).in
          return allRows.filter(
            (row) =>
              gameIds.includes(row.gameId as string) &&
              (where.apiSeasonId === undefined || row.apiSeasonId === where.apiSeasonId) &&
              (where.gameMode === undefined || row.gameMode === where.gameMode),
          )
        }
        const uidFilter = where.uid
        if (typeof uidFilter === 'string') {
          if (uidFilter === canonicalUid && gameOverlap) {
            return [{ gameId: 'shared-game' }]
          }
          return allRows.filter((row) => row.uid === uidFilter)
        }
        if (uidFilter && typeof uidFilter === 'object' && 'in' in uidFilter) {
          return allRows.filter((row) => (uidFilter.in as string[]).includes(row.uid as string))
        }
        return allRows
      },
      count: async (args: { where?: { uid?: string; gameId?: { in?: string[] } } }) => {
        if (gameOverlap && args.where?.uid === aliasUid) return 1
        if (args.where?.uid && args.where?.gameId?.in) {
          return allRows.filter(
            (row) =>
              row.uid === args.where?.uid &&
              args.where?.gameId?.in?.includes(row.gameId as string),
          ).length
        }
        if (args.where?.uid) {
          return allRows.filter((row) => row.uid === args.where?.uid).length
        }
        return 0
      },
      findFirst: async () => null,
      upsert: async () => ({}),
    },
    seasonAggregateCache: {
      findMany: async () => [],
      findUnique: async () => null,
    },
    matchParticipant: {
      findMany: async () => [],
    },
  } as never
}

describe('resolvedProfileIdentity', () => {
  it('canonical-only playerMatch aggregate', async () => {
    const canonicalUid = 'canonical-only'
    const prisma = createPrismaForIdentity({
      canonicalUid,
      playerMatchRows: Array.from({ length: 10 }, (_, i) => ({
        uid: canonicalUid,
        gameId: `g${i}`,
        gameMode: 'rank',
        apiSeasonId: 39,
        characterNum: 1,
        kills: 1,
        deaths: 0,
        assists: 0,
        playedAt: new Date(),
      })),
    })

    const identity = await resolveProfileIdentity(prisma, {
      nickname: 'bob',
      lookupUid: canonicalUid,
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 10, mmr: 1000 },
    })

    const stats = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, {
      uid: identity.owner.canonicalUid,
      playerMatchUids: identity.sources.playerMatchUids,
      apiSeasonId: 39,
      displaySeasonId: 11,
    })

    expect(stats.deduplicatedMatchCount).toBe(10)
    expect(stats.characterStats.length).toBeGreaterThan(0)
    expect(identity.verification.status).toBe('complete')
  })

  it('canonical 0 + verified alias 10 via bootstrap gameIds', async () => {
    const canonicalUid = 'canonical-empty'
    const aliasUid = 'alias-rich'
    const gameIds = Array.from({ length: 20 }, (_, i) => `boot-g${i}`)
    const prisma = createPrismaForIdentity({
      canonicalUid,
      aliasUid,
      bootstrapGameIds: gameIds,
    })

    const identity = await resolveProfileIdentity(prisma, {
      nickname: '연서',
      lookupUid: canonicalUid,
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 20, mmr: 2500 },
      bootstrapGameIds: gameIds,
      canonicalResolution: {
        uid: canonicalUid,
        swapped: false,
        bserUid: canonicalUid,
        storedUid: null,
      },
    })

    expect(identity.sources.playerMatchUids).toContain(aliasUid)
    expect(identity.sources.playerMatchUids.length).toBeGreaterThanOrEqual(2)
    const stats = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, {
      uid: identity.owner.canonicalUid,
      playerMatchUids: identity.sources.playerMatchUids,
      apiSeasonId: 39,
      displaySeasonId: 11,
    })
    expect(stats.deduplicatedMatchCount).toBe(20)
  })

  it('verified alias-only uses canonical owner', async () => {
    const canonicalUid = 'canonical-empty'
    const aliasUid = 'alias-rich'
    const prisma = createPrismaForIdentity({
      canonicalUid,
      aliasUid,
      fingerprintUid: aliasUid,
      gameOverlap: true,
      playerMatchRows: Array.from({ length: 10 }, (_, i) => ({
        uid: aliasUid,
        gameId: `g${i}`,
        gameMode: 'rank',
        apiSeasonId: 39,
        characterNum: 1,
        kills: 2,
        deaths: 1,
        assists: 1,
        teamKills: 4,
        damageToPlayer: 1000,
        playedAt: new Date(),
      })),
    })

    const identity = await resolveProfileIdentity(prisma, {
      nickname: '연서',
      lookupUid: aliasUid,
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 100, mmr: 2500 },
      canonicalResolution: {
        uid: canonicalUid,
        swapped: true,
        bserUid: aliasUid,
        storedUid: canonicalUid,
        reason: 'db-richer-profile',
      },
    })

    expect(identity.owner.canonicalUid).toBe(canonicalUid)
    expect(identity.sources.playerMatchUids).toContain(aliasUid)
  })

  it('rejects nickname-only alias without overlap', async () => {
    const canonicalUid = 'canonical-uid'
    const nicknameOnlyUid = 'nickname-only-uid'
    const prisma = createPrismaForIdentity({
      canonicalUid,
      playerMatchRows: [
        {
          uid: canonicalUid,
          gameId: 'g1',
          gameMode: 'rank',
          apiSeasonId: 39,
          characterNum: 1,
          kills: 1,
          playedAt: new Date(),
        },
        {
          uid: nicknameOnlyUid,
          gameId: 'g2',
          gameMode: 'rank',
          apiSeasonId: 39,
          characterNum: 2,
          kills: 1,
          playedAt: new Date(),
        },
      ],
    })

    const verified = await resolveVerifiedSourceUids(prisma, {
      nickname: '연서',
      lookupUid: canonicalUid,
      canonicalUid,
      apiSeasonId: 39,
      statsFingerprint: null,
      canonicalResolution: {
        uid: canonicalUid,
        swapped: false,
        bserUid: canonicalUid,
        storedUid: null,
      },
    })

    expect(verified.playerMatchUids).not.toContain(nicknameOnlyUid)
  })

  it('partial identity cache upgrades when fingerprint arrives', async () => {
    const cache = new ProfileIdentityCache()
    const prisma = createPrismaForIdentity({
      canonicalUid: 'cache-canonical',
      aliasUid: 'cache-alias',
      fingerprintUid: 'cache-alias',
      gameOverlap: true,
    })

    const partial = await resolveProfileIdentity(prisma, {
      nickname: 'bob',
      lookupUid: 'cache-canonical',
      apiSeasonId: 39,
    })
    cache.set(partial, 39)
    expect(partial.verification.status).toBe('partial')

    const upgraded = await cache.resolve(
      prisma,
      {
        nickname: 'bob',
        lookupUid: 'cache-canonical',
        apiSeasonId: 39,
        statsFingerprint: { totalGames: 100, mmr: 2500 },
      },
      () =>
        resolveProfileIdentity(prisma, {
          nickname: 'bob',
          lookupUid: 'cache-canonical',
          apiSeasonId: 39,
          statsFingerprint: { totalGames: 100, mmr: 2500 },
        }),
    )
    expect(upgraded.sources.playerMatchUids.length).toBeGreaterThanOrEqual(
      partial.sources.playerMatchUids.length,
    )
  })

  it('identity cache key is nickname-scoped across lookup uid drift', async () => {
    const cache = new ProfileIdentityCache()
    const canonicalUid = 'canonical-a'
    const aliasUid = 'alias-b'
    const gameIds = Array.from({ length: 10 }, (_, i) => `g${i}`)
    const prisma = createPrismaForIdentity({
      canonicalUid,
      aliasUid,
      bootstrapGameIds: gameIds,
      playerMatchRows: gameIds.map((gameId) => ({
        uid: aliasUid,
        gameId,
        gameMode: 'rank',
        apiSeasonId: 39,
        characterNum: 1,
        kills: 2,
        deaths: 1,
        assists: 1,
        teamKills: 4,
        damageToPlayer: 1000,
        playedAt: new Date(),
      })),
    })
    const params = {
      nickname: 'bob',
      apiSeasonId: 39,
      statsFingerprint: { totalGames: 20, mmr: 2500 },
      bootstrapGameIds: gameIds,
    }
    const loader = (lookupUid: string) =>
      resolveProfileIdentity(prisma, {
        ...params,
        lookupUid,
        canonicalResolution: {
          uid: canonicalUid,
          swapped: false,
          bserUid: lookupUid,
          storedUid: null,
        },
      })

    const first = await cache.resolve(
      prisma,
      { ...params, lookupUid: 'lookup-a' },
      () => loader('lookup-a'),
    )
    const second = await cache.resolve(
      prisma,
      { ...params, lookupUid: 'lookup-b' },
      () => loader('lookup-b'),
    )
    expect(second.sources.playerMatchUids).toEqual(first.sources.playerMatchUids)
    expect(second.owner.canonicalUid).toBe(first.owner.canonicalUid)
  })

  it('seasons owner uses canonical userNum', () => {
    const canonicalUid = 'canonical-owner'
    const lookupUid = 'lookup-source'
    const body = withSeasonsOwnerMetadata(
      { currentSeason: 11, seasons: [] },
      { nickname: '연서', userNum: uidToUserNum(canonicalUid) },
      1,
      11,
      11,
      { count: 2, strategy: 'verified-alias' },
    )

    expect(body.owner?.userNum).toBe(uidToUserNum(canonicalUid))
    expect(body.owner?.userNum).not.toBe(uidToUserNum(lookupUid))
  })
})
