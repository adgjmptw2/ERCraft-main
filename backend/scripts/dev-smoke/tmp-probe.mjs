import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const rows = await prisma.profileNicknameBinding.findMany({ where: { nickname: { in: ['마인', '하잉'] } } }).catch(() => [])
console.log('bindings', rows)
const aliases = await prisma.profileIdentityAlias.findMany({
  where: { OR: [{ sourceUid: 'mByXQq5l_Q6VKeuws_Y1s9C_4_lG9hn4_4OXG_uGqcfFWsM-T5VJFH1P' }, { canonicalUid: 'mByXQq5l_Q6VKeuws_Y1s9C_4_lG9hn4_4OXG_uGqcfFWsM-T5VJFH1P' }] },
  take: 5,
})
console.log('haying aliases', aliases)
await prisma.$disconnect()