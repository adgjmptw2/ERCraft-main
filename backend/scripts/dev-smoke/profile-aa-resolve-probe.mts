import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

import { readMatchesCache, matchesCacheId } from '../../src/cache/matchesCache.ts'
import { resolveCanonicalUidForNickname } from '../../src/cache/nicknameUidResolver.ts'
import { readSeasonStatsCacheSnapshot, seasonStatsCacheId } from '../../src/cache/seasonStatsCache.ts'
import { uidToUserNum } from '../../src/external/bserMapper.ts'
import { resolveProfileIdentity } from '../../src/utils/resolvedProfileIdentity.ts'

function squadStatsFingerprint(
  stats: Array<{ matchingTeamMode?: number; totalGames?: number; mmr?: number }> | null,
) {
  if (!stats?.length) return null
  const squad = stats.find((row) => row.matchingTeamMode === 3) ?? stats[0]
  if (!squad?.totalGames) return null
  return { totalGames: squad.totalGames, mmr: squad.mmr ?? 0 }
}

const prisma = new PrismaClient()
const API = 39

const cases = [
  {
    nick: '하잉',
    uids: [
      'Agb5ReWV_bklDabn_oii5WbsUg6MKj5iLmdqb2J4H1Ila2aXDEfFIyN6',
      'zVJ0XvwMunDcoISMjJUBH_FuG8HD5PQrkjZRFkypp3LS4fyoTjQSxcyk',
    ],
  },
  {
    nick: '연서',
    uids: [
      'HxJaKGSORZfNZU5FqFKt2PboISQWDpPOYlIFxCJNWzWY8TwfJtTD_izL',
      'sccVLO_h-HgIuMkN12JsSbqciw23MU7t5-vw7oF0dbicdYTsEe1s__Sd',
    ],
  },
]

for (const { nick, uids } of cases) {
  for (const lookupUid of uids) {
    const cached = await readSeasonStatsCacheSnapshot(prisma, seasonStatsCacheId(lookupUid, API))
    const fp = squadStatsFingerprint(cached)
    const matches = await readMatchesCache(prisma, matchesCacheId(lookupUid, 'all'))
    const bootstrap = matches?.items?.slice(0, 16).map((item) => item.matchId) ?? []
    const canonical = await resolveCanonicalUidForNickname(prisma, nick, lookupUid, {
      apiSeasonId: API,
      statsFingerprint: fp ?? undefined,
    })
    const identity = await resolveProfileIdentity(prisma, {
      nickname: nick,
      lookupUid,
      apiSeasonId: API,
      statsFingerprint: fp,
      canonicalResolution: canonical,
      bootstrapGameIds: bootstrap,
    })
    console.log(
      JSON.stringify({
        nick,
        lookup: uidToUserNum(lookupUid),
        canonical: identity.owner.canonicalUserNum,
        profile: uidToUserNum(identity.sources.profileUid),
        pmSources: identity.sources.playerMatchUids.length,
        aliases: identity.verification.verifiedAliasUids.length,
        bootstrap: bootstrap.length,
        fp,
        method: identity.verification.method,
        status: identity.verification.status,
      }),
    )
  }
}

await prisma.$disconnect()
