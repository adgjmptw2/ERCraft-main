import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const MINE = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const HAYING = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
const games = ['61931650','61931810','61944726','61947848']

async function row(uid, gameId) {
  return prisma.playerMatch.findUnique({ where: { uid_gameId: { uid, gameId } }, select: { uid: true, characterNum: true, kills: true, gameMode: true, matchingMode: true, displaySeasonId: true } })
}
async function part(gameId, uid) {
  return prisma.matchParticipant.findFirst({ where: { gameId, uid }, select: { uid: true, nickname: true, characterNum: true, kills: true } })
}
async function main() {
  const out = []
  for (const g of games) {
    out.push({
      gameId: g,
      minePm: await row(MINE, g),
      hayingPm: await row(HAYING, g),
      minePart: await part(g, MINE),
      hayingPart: await part(g, HAYING),
    })
  }
  console.log(JSON.stringify(out, null, 2))
  await prisma.$disconnect()
}
main()