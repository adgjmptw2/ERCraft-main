import 'dotenv/config'
import { createApp } from '../../src/app.ts'
import { resolveProfileIdentity } from '../../src/utils/resolvedProfileIdentity.ts'
import { readMatchesPageFromVerifiedSources } from '../../src/cache/playerMatchStore.ts'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const app = await createApp({ logger: false })
await app.ready()
const nick = '하잉'
const lookupUser = await app.bser.lookupUser(nick)
console.log('lookup', lookupUser)
const identity = await resolveProfileIdentity(app.prisma, {
  nickname: nick,
  lookupUid: lookupUser.uid,
  apiSeasonId: 39,
})
console.log('profileUid', identity.sources.profileUid)
console.log('canonical', identity.owner.canonicalUid)
const page = await readMatchesPageFromVerifiedSources(app.prisma, {
  uid: identity.sources.profileUid,
  canonicalUid: identity.sources.profileUid,
  userNum: uidToUserNum(identity.sources.profileUid),
  apiSeasonId: 39,
  displaySeasonId: 11,
  mode: 'cobalt',
  offset: 0,
  limit: 30,
})
const hit = page.items.find((i) => i.matchId === '61930778')
console.log('read hit', hit?.characterNum, hit?.characterName, hit?.kills)
await app.close()