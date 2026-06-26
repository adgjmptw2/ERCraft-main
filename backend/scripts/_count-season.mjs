import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const MINE = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const HAYING = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
const prisma = new PrismaClient()
async function count(uid) {
  const all = await prisma.playerMatch.count({ where: { uid, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
  const s39 = await prisma.playerMatch.count({ where: { uid, apiSeasonId: 39, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
  const s20 = await prisma.playerMatch.count({ where: { uid, apiSeasonId: 20, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
  return { all, s39, s20 }
}
async function cache(uid) {
  const rows = await prisma.matchesCache.findMany({ where: { id: { startsWith: uid } }, select: { id: true, expiresAt: true } })
  return rows
}
async function main() {
  console.log(JSON.stringify({
    mine: await count(MINE),
    haying: await count(HAYING),
    mineCache: await cache(MINE),
    hayingCache: await cache(HAYING),
  }, null, 2))
  await prisma.$disconnect()
}
main()