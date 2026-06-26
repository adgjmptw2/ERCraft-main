import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const uid = 'kqgPzdkKsGKdfj_AIi5_qOm2ufnZQ1vbymoEVup5Peky-c_vwa98P6Wu'
const row = await prisma.playerSeasonsCache.findUnique({ where: { id: `${uid}:1:11` } })
console.log('seasons cache exists', row != null)
await prisma.$disconnect()
