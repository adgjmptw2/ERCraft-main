import type { PrismaClient } from '@prisma/client'

import type { TeamPerformanceContract } from '../contracts/player.js'

import { isPrismaCacheModelReady } from './prismaCacheReady.js'

export interface TeamLuckMetricCacheIdentity {
  matchId: string
  targetUid: string
  teamMetricVersion: string
  residualBaselineVersion: string
  benchmarkVersion: string
}

export interface TeamLuckMetricCacheWrite extends TeamLuckMetricCacheIdentity {
  sourceFingerprint: string
  value: TeamPerformanceContract
}

type TeamLuckMetricCacheDelegate = {
  findUnique: (args: {
    where: {
      matchId_targetUid_teamMetricVersion_residualBaselineVersion_benchmarkVersion: TeamLuckMetricCacheIdentity
    }
  }) => Promise<{
    sourceFingerprint: string
    payload: unknown
  } | null>
  upsert: (args: {
    where: {
      matchId_targetUid_teamMetricVersion_residualBaselineVersion_benchmarkVersion: TeamLuckMetricCacheIdentity
    }
    create: Record<string, unknown>
    update: Record<string, unknown>
  }) => Promise<unknown>
  deleteMany: (args: { where: { matchId: string } }) => Promise<unknown>
}

function delegate(prisma: PrismaClient): TeamLuckMetricCacheDelegate | null {
  if (!isPrismaCacheModelReady(prisma, 'teamLuckMetricCache')) return null
  return (prisma as unknown as { teamLuckMetricCache: TeamLuckMetricCacheDelegate })
    .teamLuckMetricCache
}

function isTeamPerformanceContract(value: unknown): value is TeamPerformanceContract {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<TeamPerformanceContract>
  return (
    (row.status === 'ready' || row.status === 'partial' || row.status === 'unavailable') &&
    typeof row.teammateCount === 'number' &&
    typeof row.gradedTeammateCount === 'number'
  )
}

export async function readTeamLuckMetricCache(
  prisma: PrismaClient,
  identity: TeamLuckMetricCacheIdentity,
  sourceFingerprint: string,
): Promise<TeamPerformanceContract | null> {
  const model = delegate(prisma)
  if (!model) return null

  const cached = await model.findUnique({
    where: {
      matchId_targetUid_teamMetricVersion_residualBaselineVersion_benchmarkVersion: identity,
    },
  })
  if (!cached || cached.sourceFingerprint !== sourceFingerprint) return null
  return isTeamPerformanceContract(cached.payload) ? cached.payload : null
}

export async function writeTeamLuckMetricCache(
  prisma: PrismaClient,
  params: TeamLuckMetricCacheWrite,
): Promise<void> {
  const model = delegate(prisma)
  if (!model) return

  const computedAt = new Date()
  const stored = {
    matchId: params.matchId,
    targetUid: params.targetUid,
    teamMetricVersion: params.teamMetricVersion,
    residualBaselineVersion: params.residualBaselineVersion,
    benchmarkVersion: params.benchmarkVersion,
    teamLuckResidual: params.value.teamLuckResidual ?? params.value.teammatePerformanceScore,
    teamLuckLabel: params.value.teamLuckLabel ?? params.value.teammatePerformanceLabel,
    carryBurdenResidual: params.value.carryBurdenResidual ?? params.value.carryBurdenDelta,
    carryBurdenLabel: params.value.carryBurdenLabel,
    confidence: params.value.confidence ?? 'low',
    fallbackLevel: params.value.fallbackLevel ?? null,
    sampleCount: params.value.sampleCount ?? null,
    teammateCount: params.value.gradedTeammateCount,
    sourceFingerprint: params.sourceFingerprint,
    payload: params.value,
    computedAt,
  }

  await model.upsert({
    where: {
      matchId_targetUid_teamMetricVersion_residualBaselineVersion_benchmarkVersion: {
        matchId: params.matchId,
        targetUid: params.targetUid,
        teamMetricVersion: params.teamMetricVersion,
        residualBaselineVersion: params.residualBaselineVersion,
        benchmarkVersion: params.benchmarkVersion,
      },
    },
    create: stored,
    update: stored,
  })
}

export async function invalidateTeamLuckMetricCacheForMatch(
  prisma: PrismaClient,
  matchId: string,
): Promise<void> {
  const model = delegate(prisma)
  if (!model) return
  await model.deleteMany({ where: { matchId } })
}
