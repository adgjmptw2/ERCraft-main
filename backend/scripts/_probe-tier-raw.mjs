import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { refreshSeasonRecordTier } from '../dist/utils/seasonRecordTier.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'

const prisma = new PrismaClient()
const nick = '\uC18C\uC911\uD788\uC5EC\uAE30\uB2E4'
try {
  const binding = await prisma.profileNicknameBinding.findFirst({
    where: { normalizedNickname: nick.toLowerCase() },
    select: { canonicalUid: true },
  })
  const cache = await prisma.playerSeasonsCache.findFirst({
    where: { canonicalUid: binding.canonicalUid },
    select: { payloadJson: true },
  })
  const body = JSON.parse(cache.payloadJson)
  for (const s of body.seasons.filter((x) => x.played)) {
    const raw = s
    const ref = refreshSeasonRecordTier(s)
    const noRank = getRankTierFromRp(raw.rank.rp, undefined, raw.seasonNumber)
    const withRank = raw.rank.rank ? getRankTierFromRp(raw.rank.rp, raw.rank.rank, raw.seasonNumber) : null
    console.log(
      'S' + raw.seasonNumber,
      'cacheTier', raw.rank.tier,
      'cacheField', raw.tier,
      'cacheRank', raw.rank.rank,
      'rp', raw.rank.rp,
      'noRank->', noRank.tierNameKo,
      'withRank->', withRank?.tierNameKo ?? '-',
      'refreshed->', ref.rank.tier,
    )
  }
} finally {
  await prisma.$disconnect()
}