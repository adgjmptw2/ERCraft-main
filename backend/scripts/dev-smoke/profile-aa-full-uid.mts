import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const prisma = new PrismaClient()
const targets = [1464399340, 2036455880, 239272700, 1031595008, 1950017233]

const all = await prisma.playerMatch.findMany({ select: { uid: true }, distinct: ['uid'] })
for (const t of targets) {
  const hit = all.find((r) => uidToUserNum(r.uid) === t)
  if (!hit) {
    console.log('missing', t)
    continue
  }
  const count = await prisma.playerMatch.count({
    where: { uid: hit.uid, apiSeasonId: 39, gameMode: 'rank' },
  })
  console.log(JSON.stringify({ userNum: t, uidLen: hit.uid.length, uid: hit.uid, rank39: count }))
}
await prisma.$disconnect()
