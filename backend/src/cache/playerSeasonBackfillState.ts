import type { PrismaClient } from '@prisma/client'

import type { FullBackfillStoppedReason } from './playerMatchBackfill.js'

export type BackfillStateStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'partial'
  | 'failed'
  | 'cooldown'

export interface PlayerSeasonBackfillStateRow {
  id: string
  uid: string
  apiSeasonId: number
  displaySeasonId: number | null
  status: string
  officialSeasonGames: number | null
  collectedGames: number
  nextCursor: number | null
  lastCursor: number | null
  lastStoppedReason: string | null
  lastError: string | null
  pagesFetchedTotal: number
  rawGamesSeenTotal: number
  rankGamesSeenTotal: number
  upsertedTotal: number
  duplicateTotal: number
  startedAt: Date | null
  lastRunAt: Date | null
  finishedAt: Date | null
  retryAfter: Date | null
}

export function backfillStateId(uid: string, apiSeasonId: number): string {
  return `${uid}:${apiSeasonId}`
}

export function isPrismaBackfillStateReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).playerSeasonBackfillState
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { findUnique?: unknown }).findUnique === 'function'
  )
}

export async function readPlayerSeasonBackfillState(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<PlayerSeasonBackfillStateRow | null> {
  if (!isPrismaBackfillStateReady(prisma)) return null
  return prisma.playerSeasonBackfillState.findUnique({
    where: { id: backfillStateId(uid, apiSeasonId) },
  })
}

export async function writePlayerSeasonBackfillState(
  prisma: PrismaClient,
  row: {
    uid: string
    apiSeasonId: number
    displaySeasonId?: number | null
    status: BackfillStateStatus
    officialSeasonGames: number | null
    collectedGames: number
    nextCursor?: number | null
    lastCursor?: number | null
    lastStoppedReason?: FullBackfillStoppedReason | null
    lastError?: string | null
    pagesFetchedDelta?: number
    rawGamesSeenDelta?: number
    rankGamesSeenDelta?: number
    upsertedDelta?: number
    duplicateDelta?: number
    retryAfter?: Date | null
    markFinished?: boolean
  },
): Promise<void> {
  if (!isPrismaBackfillStateReady(prisma)) return

  const id = backfillStateId(row.uid, row.apiSeasonId)
  const existing = await prisma.playerSeasonBackfillState.findUnique({ where: { id } })
  // 재시작 후 full backfill 방지 — complete row를 partial/running으로 덮지 않음
  if (existing?.status === 'complete' && row.status !== 'complete') {
    return
  }
  const now = new Date()

  await prisma.playerSeasonBackfillState.upsert({
    where: { id },
    create: {
      id,
      uid: row.uid,
      apiSeasonId: row.apiSeasonId,
      displaySeasonId: row.displaySeasonId ?? null,
      status: row.status,
      officialSeasonGames: row.officialSeasonGames,
      collectedGames: row.collectedGames,
      nextCursor: row.nextCursor ?? null,
      lastCursor: row.lastCursor ?? null,
      lastStoppedReason: row.lastStoppedReason ?? null,
      lastError: row.lastError ?? null,
      pagesFetchedTotal: row.pagesFetchedDelta ?? 0,
      rawGamesSeenTotal: row.rawGamesSeenDelta ?? 0,
      rankGamesSeenTotal: row.rankGamesSeenDelta ?? 0,
      upsertedTotal: row.upsertedDelta ?? 0,
      duplicateTotal: row.duplicateDelta ?? 0,
      startedAt: now,
      lastRunAt: now,
      finishedAt: row.markFinished ? now : null,
      retryAfter: row.retryAfter ?? null,
    },
    update: {
      displaySeasonId: row.displaySeasonId ?? existing?.displaySeasonId ?? null,
      status: row.status,
      officialSeasonGames: row.officialSeasonGames,
      collectedGames: row.collectedGames,
      nextCursor: row.nextCursor ?? null,
      lastCursor: row.lastCursor ?? null,
      lastStoppedReason: row.lastStoppedReason ?? null,
      lastError: row.lastError ?? null,
      pagesFetchedTotal: (existing?.pagesFetchedTotal ?? 0) + (row.pagesFetchedDelta ?? 0),
      rawGamesSeenTotal: (existing?.rawGamesSeenTotal ?? 0) + (row.rawGamesSeenDelta ?? 0),
      rankGamesSeenTotal: (existing?.rankGamesSeenTotal ?? 0) + (row.rankGamesSeenDelta ?? 0),
      upsertedTotal: (existing?.upsertedTotal ?? 0) + (row.upsertedDelta ?? 0),
      duplicateTotal: (existing?.duplicateTotal ?? 0) + (row.duplicateDelta ?? 0),
      lastRunAt: now,
      finishedAt: row.markFinished ? now : null,
      retryAfter: row.retryAfter ?? null,
    },
  })
}

export function mapStoppedReasonToStatus(
  stoppedReason: FullBackfillStoppedReason,
  rankCount: number,
  officialSeasonGames: number | null,
  options?: { preserveComplete?: boolean },
): BackfillStateStatus {
  if (officialSeasonGames !== null && officialSeasonGames > 0 && rankCount >= officialSeasonGames) {
    return 'complete'
  }
  if (options?.preserveComplete && stoppedReason === 'api-error') {
    return 'complete'
  }
  if (stoppedReason === 'api-error') return 'failed'
  if (stoppedReason === 'complete') return 'complete'
  return 'partial'
}
