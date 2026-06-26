import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { loadSeasonCatalog } from '../dist/external/seasonCatalog.js'
import { resolveProfileIdentity } from '../dist/utils/resolvedProfileIdentity.js'
import { BserClient } from '../dist/external/bserClient.js'

const prisma = new PrismaClient()
const bser = new BserClient(process.env.BSER_API_KEY ?? '')

async function resolve(nick) {
  const user = await bser.getUserByNickname(nick)
  const catalog = await loadSeasonCatalog(bser)
  const apiSeasonId = catalog.currentApiSeasonId?.() ?? 39
  const identity = await resolveProfileIdentity(prisma, {
    requestedNickname: nick,
    lookupUser: user,
    apiSeasonId,
    statsFingerprint: null,
    explicitUid: false,
  })
  return {
    nick,
    profileUid: identity.sources.profileUid,
    canonicalUid: identity.owner.canonicalUid,
    canonicalUserNum: identity.owner.canonicalUserNum,
    verifiedAliasUids: identity.verification.verifiedAliasUids,
    playerMatchUids: identity.sources.playerMatchUids,
    seasonUids: identity.sources.seasonUids,
  }
}

async function main() {
  const out = await Promise.all([resolve('留덉씤'), resolve('?섏엵')])
  console.log(JSON.stringify(out, null, 2))
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })