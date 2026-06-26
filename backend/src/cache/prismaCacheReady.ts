import type { PrismaClient } from '@prisma/client'

type CacheModel =
  | 'seasonStatsCache'
  | 'playerSeasonsCache'
  | 'matchesCache'
  | 'seasonAggregateCache'
  | 'characterGradeSnapshot'
  | 'teamLuckMetricCache'

const warnedModels = new Set<CacheModel>()

/** prisma generate 전·핫리로드 직후 등 delegate 미준비 시 DB 캐시 스킵 */
export function isPrismaCacheModelReady(prisma: PrismaClient, model: CacheModel): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>)[model]
  const ready =
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { findUnique?: unknown }).findUnique === 'function'

  if (!ready && process.env.NODE_ENV !== 'production' && !warnedModels.has(model)) {
    warnedModels.add(model)
    console.warn(
      `[ercraft] DB cache disabled: prisma.${model} delegate not ready. ` +
        'Run `cd backend && npx prisma migrate dev && npx prisma generate`.',
    )
  }

  return ready
}

export function warnPrismaCacheReadiness(prisma: PrismaClient): void {
  isPrismaCacheModelReady(prisma, 'seasonStatsCache')
  isPrismaCacheModelReady(prisma, 'playerSeasonsCache')
  isPrismaCacheModelReady(prisma, 'matchesCache')
  isPrismaCacheModelReady(prisma, 'seasonAggregateCache')
  isPrismaCacheModelReady(prisma, 'characterGradeSnapshot')
  isPrismaCacheModelReady(prisma, 'teamLuckMetricCache')
}
