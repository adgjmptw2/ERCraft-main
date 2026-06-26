import { PrismaClient } from '@prisma/client'

const USERS = process.argv.slice(2)
if (USERS.length === 0) {
  console.error('Usage: node clear-identity-bindings.mjs <nickname> [...]')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  for (const nickname of USERS) {
    const normalized = nickname.trim().toLowerCase()
    const binding = await prisma.profileNicknameBinding.findUnique({
      where: { normalizedNickname: normalized },
      select: { canonicalUid: true },
    })
    await prisma.profileNicknameBinding.deleteMany({ where: { normalizedNickname: normalized } })
    if (binding?.canonicalUid) {
      await prisma.profileIdentityAlias.deleteMany({
        where: { canonicalUid: binding.canonicalUid },
      })
    }
    console.log('cleared', nickname, binding?.canonicalUid ?? '(no binding)')
  }
} finally {
  await prisma.$disconnect()
}
