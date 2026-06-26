import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const MINE = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const HAYING = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
const prisma = new PrismaClient()

async function readCache(uid, mode) {
  const id = mode === 'all' ? `${uid}:0` : `${uid}:${mode}`
  const row = await prisma.matchesCache.findUnique({ where: { id } })
  if (!row) return null
  const data = row.data
  const items = data?.items ?? []
  const cobalt = items.filter((i) => i.gameMode === 'cobalt')
  return { id, total: items.length, cobalt: cobalt.length, sample: cobalt.slice(0, 3).map((i) => ({ gameId: i.matchId, char: i.characterNum, kills: i.kills })) }
}

async function main() {
  console.log(JSON.stringify({
    mineAll: await readCache(MINE, 'all'),
    mineCobalt: await readCache(MINE, 'cobalt'),
    hayingAll: await readCache(HAYING, 'all'),
    hayingCobalt: await readCache(HAYING, 'cobalt'),
  }, null, 2))
  await prisma.$disconnect()
}
main()