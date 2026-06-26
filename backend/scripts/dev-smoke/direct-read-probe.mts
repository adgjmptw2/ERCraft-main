import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { readMatchesPageFromVerifiedSources } from '../../src/cache/playerMatchStore.ts'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const prisma = new PrismaClient()
const HAYING = 'mByXQq5l_Q6VKeuws_Y1s9C_4_lG9hn4_4OXG_uGqcfFWsM-T5VJFH1P'
const page = await readMatchesPageFromVerifiedSources(prisma, {
  uid: HAYING,
  canonicalUid: HAYING,
  userNum: uidToUserNum(HAYING),
  apiSeasonId: 39,
  displaySeasonId: 11,
  mode: 'cobalt',
  offset: 0,
  limit: 30,
})
const hit = page.items.find((i) => i.matchId === '61930778')
console.log('direct read hit', hit ? { char: hit.characterNum, name: hit.characterName, kills: hit.kills } : 'missing')
console.log('total', page.totalCount)
await prisma.$disconnect()