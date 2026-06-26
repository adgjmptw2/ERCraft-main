import type { PrismaClient } from '@prisma/client'

import { collectorUsableDailyBudget, type CollectorConfig } from './config.js'

export interface CollectorBudgetSnapshot {
  dailyBudget: number
  usedToday: number
  remainingToday: number
  collectorRps: number
}

type UsageEndpoint = 'user-games' | 'game-detail' | 'season-data' | 'l10n' | 'user-nickname'

function todayUtcDate(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function usageId(endpoint: string, date = todayUtcDate()): string {
  return `${date.toISOString().slice(0, 10)}:${endpoint}`
}

export async function readCollectorUsedToday(prisma: PrismaClient): Promise<number> {
  const today = todayUtcDate()
  const rows = await prisma.collectorApiUsage.findMany({
    where: { date: today },
    select: { collectorRequestCount: true },
  })
  return rows.reduce((sum, row) => sum + row.collectorRequestCount, 0)
}

export async function readCollectorBudgetSnapshot(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<CollectorBudgetSnapshot> {
  const usedToday = await readCollectorUsedToday(prisma)
  const usableBudget = collectorUsableDailyBudget(config)
  return {
    dailyBudget: config.dailyBudget,
    usedToday,
    remainingToday: Math.max(0, usableBudget - usedToday),
    collectorRps: config.maxRps,
  }
}

export async function canSpendCollectorRequest(
  prisma: PrismaClient,
  config: CollectorConfig,
  planned = 1,
): Promise<boolean> {
  const snapshot = await readCollectorBudgetSnapshot(prisma, config)
  return snapshot.remainingToday >= planned
}

export async function recordCollectorRequest(
  prisma: PrismaClient,
  endpoint: UsageEndpoint,
  outcome: 'success' | 'failure' | 'rate-limited',
): Promise<void> {
  const date = todayUtcDate()
  const id = usageId(endpoint, date)
  await prisma.collectorApiUsage.upsert({
    where: { id },
    create: {
      id,
      date,
      endpoint,
      successCount: outcome === 'success' ? 1 : 0,
      failureCount: outcome === 'failure' ? 1 : 0,
      rateLimitedCount: outcome === 'rate-limited' ? 1 : 0,
      collectorRequestCount: 1,
      interactiveRequestCount: 0,
    },
    update: {
      successCount: outcome === 'success' ? { increment: 1 } : undefined,
      failureCount: outcome === 'failure' ? { increment: 1 } : undefined,
      rateLimitedCount: outcome === 'rate-limited' ? { increment: 1 } : undefined,
      collectorRequestCount: { increment: 1 },
    },
  })
}

export async function waitCollectorRps(config: CollectorConfig): Promise<void> {
  const baseDelay = Math.ceil(1000 / config.maxRps)
  const jitter = Math.floor(Math.random() * Math.min(250, baseDelay))
  await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter))
}
