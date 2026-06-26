import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const MINE_PROFILE = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
const HAYING_PROFILE = 'mByXQq5l_Q6VKeuws_Y1s9C_4_lG9hn4_4OXG_uGqcfFWsM-T5VJFH1P'
for (const [label, uid] of [['mine', MINE_PROFILE], ['haying', HAYING_PROFILE]]) {
  const total = await prisma.playerMatch.count({ where: { uid } })
  const cobalt = await prisma.playerMatch.count({ where: { uid, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
  const rank = await prisma.playerMatch.count({ where: { uid, gameMode: 'rank' } })
  console.log(label, 'uid', uid.slice(0,16)+'...', 'total', total, 'rank', rank, 'cobalt', cobalt)
  const top = await prisma.playerMatch.findMany({ where: { uid, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] }, orderBy: { playedAt: 'desc' }, take: 3, select: { gameId: true, characterNum: true, characterName: true, kills: true } })
  console.log(' cobalt top', top)
}
const shared = await prisma.playerMatch.findMany({ where: { gameId: '61930778' }, select: { uid: true, characterNum: true, characterName: true, kills: true } })
console.log('shared 61930778', shared)
await prisma.$disconnect()