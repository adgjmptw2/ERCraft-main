import { PrismaClient } from '@prisma/client'

import { backfillDamageTimeRobustGrades } from '../dist/scripts/backfillDamageTimeRobustGrades.js'

const prisma = new PrismaClient()
try {
  const result = await backfillDamageTimeRobustGrades(prisma)
  console.log(JSON.stringify(result, null, 2))
} finally {
  await prisma.$disconnect()
}
