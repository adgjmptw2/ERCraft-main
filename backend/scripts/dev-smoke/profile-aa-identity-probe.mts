import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { resolveCanonicalUidForNickname } from '../../src/cache/nicknameUidResolver.ts'
import { resolveProfileIdentity } from '../../src/utils/resolvedProfileIdentity.ts'

const prisma = new PrismaClient()
const API_SEASON = 39

async function probe(nick: string, lookupUid: string) {
  const identity = await resolveProfileIdentity(prisma, {
    nickname: nick,
    lookupUid,
    apiSeasonId: API_SEASON,
  })
  console.log(
    JSON.stringify({
      nick,
      lookupUid: lookupUid.slice(0, 20) + '…',
      canonical: identity.owner.canonicalUid.slice(0, 20) + '…',
      canonicalUserNum: identity.owner.canonicalUserNum,
      profileUid: identity.sources.profileUid.slice(0, 20) + '…',
      playerMatchUids: identity.sources.playerMatchUids.length,
      verifiedAlias: identity.verification.verifiedAliasUids.length,
      method: identity.verification.method,
      reasons: identity.verification.devReasons,
    }),
  )
}

// lookup uids from latest diagnostic PM owners
await probe('하잉', 'zVJ0XvwMunDcoISMjJUBH_FuG8HD5PQrkjZRFkypp3LS4fyoTjQSxcyk')
await probe('연서', 'cdVF1bfKDL-PBvw3PrsnbbyKCEcvlb1Mvbwu3QELt9DnoGqiVAtANlRS')
await probe('절단마술사', 'D1FkLlJMR6o4kliInI2YdKCBUBUexE5Y6fNo')

await prisma.$disconnect()
