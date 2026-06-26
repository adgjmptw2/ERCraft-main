import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { resolveProfileIdentity } from '../../src/utils/resolvedProfileIdentity.ts'

const prisma = new PrismaClient()
const API_SEASON = 39
const MINE_CANON = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
const HAYING_CANON = 'mByXQq5l_Q6VKeuws_Y1s9C_4_lG9hn4_4OXG_uGqcfFWsM-T5VJFH1P'

async function probe(nick, lookupUid) {
  const identity = await resolveProfileIdentity(prisma, {
    nickname: nick,
    lookupUid,
    apiSeasonId: API_SEASON,
  })
  const uids = identity.sources.playerMatchUids
  console.log('===', nick, '===')
  console.log('canonical', identity.owner.canonicalUid)
  console.log('userNum', identity.owner.canonicalUserNum)
  console.log('profileUid', identity.sources.profileUid)
  console.log('playerMatchUids', uids.length, uids)
  console.log('cross: has mine', uids.includes(MINE_CANON), 'has haying', uids.includes(HAYING_CANON))
}

await probe('마인', MINE_CANON)
await probe('하잉', HAYING_CANON)
await prisma.$disconnect()