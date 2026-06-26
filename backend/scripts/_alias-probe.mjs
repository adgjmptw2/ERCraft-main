import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const MINE = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const HAYING = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
const prisma = new PrismaClient()
async function aliases(uid) {
  return prisma.profileIdentityAlias.findMany({ where: { OR: [{ canonicalUid: uid }, { sourceUid: uid }] } })
}
async function main() {
  console.log(JSON.stringify({ mine: await aliases(MINE), haying: await aliases(HAYING) }, null, 2))
  await prisma.$disconnect()
}
main()