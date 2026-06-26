import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

import { refreshSeasonRecordTier } from '../dist/utils/seasonRecordTier.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'

const prisma = new PrismaClient()

try {
  console.log('computed no rank', getRankTierFromRp(9519, undefined, 11))
  console.log('computed rank1', getRankTierFromRp(9519, 1, 11))

  const nick = '\uC18C\uC911\uD788\uC5EC\uAE30\uB2E4'
  const binding = await prisma.profileNicknameBinding.findFirst({
    where: { nickname: nick },
    select: { canonicalUid: true },
  })
  if (!binding) {
    console.log('no binding')
    process.exit(0)
  }
  const cache = await prisma.playerSeasonsCache.findFirst({
    where: { canonicalUid: binding.canonicalUid },
    select: { payloadJson: true },
  })
  if (!cache) {
    console.log('no cache')
    process.exit(0)
  }
  const body = JSON.parse(cache.payloadJson)
  for (const season of body.seasons) {
    if (!season.played) continue
    const refreshed = refreshSeasonRecordTier(season)
    console.log(
      'S' + season.seasonNumber,
      'raw',
      season.rank.tier,
      'tierField',
      season.tier,
      '->',
      refreshed.rank.tier,
      'rp',
      season.rank.rp,
      'rank',
      season.rank.rank,
    )
  }
} finally {
  await prisma.$disconnect()
}