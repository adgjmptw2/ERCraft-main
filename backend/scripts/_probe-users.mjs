import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

function uidToUserNum(uid) {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

async function main() {
  const bindings = await prisma.profileNicknameBinding.findMany({
    where: { nickname: { in: ['마인', '하잉'] } },
    select: { nickname: true, canonicalUid: true, canonicalUserNum: true },
  }).catch(() => [])
  const participants = await prisma.matchParticipant.findMany({
    where: { nickname: { in: ['마인', '하잉'] } },
    select: { uid: true, nickname: true, gameId: true, characterNum: true, kills: true },
    take: 20,
    orderBy: { createdAt: 'desc' },
  })
  const uidsFromParticipants = [...new Set(participants.map((p) => p.uid).filter(Boolean))]
  const pmByUid = {}
  for (const uid of uidsFromParticipants) {
    pmByUid[uid] = await prisma.playerMatch.count({ where: { uid, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
  }
  const api = await fetch('http://127.0.0.1:3001/api/players/' + encodeURIComponent('마인') + '/summary').then((r) => r.json()).catch((e) => ({ error: String(e) }))
  const api2 = await fetch('http://127.0.0.1:3001/api/players/' + encodeURIComponent('하잉') + '/summary').then((r) => r.json()).catch((e) => ({ error: String(e) }))
  console.log(JSON.stringify({ bindings, participants: participants.slice(0, 10), pmByUid, mineSummary: api?.data ? { userNum: api.data.userNum, tier: api.data.tier } : api, hayingSummary: api2?.data ? { userNum: api2.data.userNum, tier: api2.data.tier } : api2, uidToUserNum1009897353: uidToUserNum('1009897353') }, null, 2))
  await prisma.$disconnect()
}
main()