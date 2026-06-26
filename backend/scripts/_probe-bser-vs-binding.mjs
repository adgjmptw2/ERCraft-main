import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { BserClient } from '../dist/external/bserClient.js'
import { readPersistedNicknameBinding } from '../dist/cache/profileNicknameBinding.js'

const p = new PrismaClient()
const bser = new BserClient()

for (const nick of ['마인', '하잉']) {
  const user = await bser.getUserByNickname(nick)
  const binding = await readPersistedNicknameBinding(p, nick)
  const bserPm = user
    ? await p.playerMatch.count({ where: { uid: user.uid, apiSeasonId: 39, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
    : -1
  const bindPm = binding
    ? await p.playerMatch.count({ where: { uid: binding.canonicalUid, apiSeasonId: 39, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
    : -1
  console.log({ nick, bserUid: user?.uid, bindingUid: binding?.canonicalUid, same: user?.uid === binding?.canonicalUid, bserCobaltPm: bserPm, bindingCobaltPm: bindPm })
}
await p.$disconnect()