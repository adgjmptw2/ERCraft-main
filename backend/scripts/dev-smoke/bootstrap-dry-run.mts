import { PrismaClient } from '@prisma/client'
import { bootstrapProfileIdentityFromDb } from '../../src/services/profileIdentityBootstrap.js'

const USERS = ['하잉', '연서', '절단마술사']
const API_SEASON = 39
const prisma = new PrismaClient()

for (const nickname of USERS) {
  await prisma.profileNicknameBinding.deleteMany({
    where: { normalizedNickname: nickname.trim().toLowerCase() },
  })

  const participants = await prisma.matchParticipant.findMany({
    where: { nickname },
    select: { gameId: true },
    distinct: ['gameId'],
  })

  const result = await bootstrapProfileIdentityFromDb(prisma, nickname, 'lookup-test-uid', API_SEASON)

  const bindingAfter = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname: nickname.trim().toLowerCase() },
  })
  const aliases = bindingAfter
    ? await prisma.profileIdentityAlias.findMany({
        where: { canonicalUid: bindingAfter.canonicalUid, isActive: true },
      })
    : []

  console.log('\n', nickname, {
    participantGames: participants.length,
    bootstrap: result,
    binding: bindingAfter?.canonicalUid?.slice(0, 32) ?? null,
    aliasCount: aliases.length,
  })
}

await prisma.$disconnect()
