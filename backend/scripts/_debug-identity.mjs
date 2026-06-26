import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const mine = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const haying = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
for (const [label, uid] of [['mine', mine], ['haying', haying]]) {
  const c = await p.playerMatch.count({ where: { uid, apiSeasonId: 39, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] } })
  console.log(label, 'cobalt count', c)
}
const aliases = await p.profileIdentityAlias.findMany({ where: { OR: [{ canonicalUid: mine }, { canonicalUid: haying }, { aliasUid: mine }, { aliasUid: haying }] } })
console.log('aliases', aliases.length, aliases.map(a => ({canon:a.canonicalUid.slice(0,8), alias:a.aliasUid.slice(0,8), active:a.active, method:a.verificationMethod})))
const bindings = await p.profileNicknameBinding.findMany({ where: { normalizedNickname: { in: ['마인', '하잉'] } } })
console.log('bindings', bindings)
await p.$disconnect()