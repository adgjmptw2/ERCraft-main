/**
 * 39.10Z — profile owner/source separation contracts.
 */
import { describe, expect, it } from 'vitest'

import { withSeasonsOwnerMetadata } from '../utils/seasonsOwner.js'
import { uidToUserNum } from '../external/bserMapper.js'
import { buildCurrentSeasonCharacterStatsFromVerifiedSources } from './currentSeasonCharacterStats.js'

describe('profile ownership — read path contracts', () => {
  it('seasons owner matches summary canonical userNum', () => {
    const canonicalUid = 'db-richer-canonical-uid-alias'
    const lookupUid = 'bser-live-uid-for-nickname'

    const seasonsBody = withSeasonsOwnerMetadata(
      { currentSeason: 11, seasons: [] },
      { nickname: '하잉', userNum: uidToUserNum(canonicalUid) },
      1,
      11,
      11,
    )

    expect(seasonsBody.owner?.userNum).toBe(uidToUserNum(canonicalUid))
    expect(seasonsBody.owner?.userNum).not.toBe(uidToUserNum(lookupUid))
  })

  it('PlayerMatch aggregate uses apiSeasonId 39 not mismatched filter', async () => {
    const uid = 'diagnostic-uid-season-filter'
    const rows = [
      {
        uid,
        apiSeasonId: 39,
        displaySeasonId: 11,
        gameId: 'g1',
        gameMode: 'rank',
        playedAt: new Date('2026-06-01T00:00:00Z'),
        characterNum: 1,
        kills: 1,
        deaths: 0,
        assists: 0,
        teamKills: 2,
        damageToPlayer: 100,
      },
    ]

    const prisma = {
      playerMatch: {
        findMany: async (args: { where?: { apiSeasonId?: number } }) =>
          args.where?.apiSeasonId === 39 ? rows : [],
        count: async () => rows.length,
        findFirst: async () => null,
        upsert: async () => ({}),
      },
    } as never

    const wrongSeason = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, {
      uid,
      playerMatchUids: [uid],
      apiSeasonId: 20,
      displaySeasonId: 11,
    })
    const correctSeason = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, {
      uid,
      playerMatchUids: [uid],
      apiSeasonId: 39,
      displaySeasonId: 11,
    })

    expect(wrongSeason.deduplicatedMatchCount).toBe(0)
    expect(correctSeason.deduplicatedMatchCount).toBe(1)
    expect(correctSeason.characterStats.length).toBe(1)
  })
})
