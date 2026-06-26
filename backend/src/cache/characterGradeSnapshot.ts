import { createHash } from 'node:crypto'

import type { Prisma, PrismaClient } from '@prisma/client'

import type {
  CharacterGradeSnapshotStatus,
  OverallGradeV2Contract,
  PlayerMatchCharacterStatsMetaContract,
  ProductionAnalysisAxesContract,
  SeasonCharacterAggregateContract,
} from '../contracts/player.js'
import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
  type GradeBaselineTierKey,
} from '../services/characterPerformanceGrade/config.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import type { RankTier } from '../utils/rankTier.js'
import { isGradeSupportedMode } from '../types/matchesMode.js'
import { isPrismaCacheModelReady } from './prismaCacheReady.js'

export const CHARACTER_GRADE_MATCH_MODE = 'rank'

export interface CharacterGradeSourceFingerprint {
  value: string
  matchCount: number
  maxMatchId: string | null
  latestMatchTimestamp: string | null
  latestSourceUpdatedAt: string | null
}

export interface CharacterGradeSnapshotPayload {
  characterStats: SeasonCharacterAggregateContract[]
  meta: PlayerMatchCharacterStatsMetaContract
  overallGradeV2?: OverallGradeV2Contract | null
  overallAnalysisAxes?: ProductionAnalysisAxesContract | null
}

export interface CharacterGradeSnapshotRecord extends CharacterGradeSnapshotPayload {
  id: string
  uid: string
  canonicalUserNum: number
  apiSeasonId: number
  displaySeasonId: number
  matchMode: string
  benchmarkVersion: string
  metricPresetVersion: string
  sourceFingerprint: string
  status: CharacterGradeSnapshotStatus
  computedAt: string
}

export function resolveGradePlayerTierKey(playerTier: RankTier | null): GradeBaselineTierKey | null {
  return playerTier ? rankTierToGradeBaselineKey(playerTier) : null
}

/** 티어 기준 등급 스냅샷이 현재 플레이어 티어와 맞지 않으면 재계산한다. */
export function snapshotNeedsGradeTierRecompute(params: {
  characterStats: ReadonlyArray<Pick<SeasonCharacterAggregateContract, 'gradeStatus'>>
  playerTier: RankTier | null
  storedPlayerTierKey?: string | null
}): boolean {
  const currentTierKey = resolveGradePlayerTierKey(params.playerTier)
  if (!currentTierKey) return false

  const hasMissingBaseline = params.characterStats.some(
    (row) => row.gradeStatus === 'missing-baseline',
  )
  if (hasMissingBaseline) return true

  const storedTierKey = params.storedPlayerTierKey?.trim()
  return storedTierKey != null && storedTierKey.length > 0 && storedTierKey !== currentTierKey
}

export function characterGradeSnapshotId(params: {
  canonicalUserNum: number
  apiSeasonId: number
  matchMode?: string
  benchmarkVersion?: string
  metricPresetVersion?: string
}): string {
  return [
    params.canonicalUserNum,
    params.apiSeasonId,
    params.matchMode ?? CHARACTER_GRADE_MATCH_MODE,
    params.benchmarkVersion ?? CHARACTER_GRADE_BENCHMARK_VERSION,
    params.metricPresetVersion ?? CHARACTER_GRADE_METRIC_PRESET_VERSION,
  ].join(':')
}

function hashStable(parts: Record<string, string | number | null>): string {
  const ordered = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key] ?? ''}`)
    .join('|')
  return createHash('sha256').update(ordered).digest('hex')
}

export async function computeCharacterGradeSourceFingerprint(
  prisma: PrismaClient,
  params: {
    uid: string
    apiSeasonId: number
    matchMode?: string
  },
): Promise<CharacterGradeSourceFingerprint> {
  const matchMode = params.matchMode ?? CHARACTER_GRADE_MATCH_MODE
  if (!isGradeSupportedMode(matchMode)) {
    return {
      value: `unsupported-mode:${matchMode}`,
      matchCount: 0,
      maxMatchId: null,
      latestMatchTimestamp: null,
      latestSourceUpdatedAt: null,
    }
  }
  const where = {
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    gameMode: matchMode,
  }
  const [matchCount, latest, maxGame] = await Promise.all([
    prisma.playerMatch.count({ where }),
    prisma.playerMatch.findFirst({
      where,
      orderBy: [{ playedAt: 'desc' }, { gameId: 'desc' }],
      select: { gameId: true, playedAt: true, updatedAt: true },
    }),
    prisma.playerMatch.findFirst({
      where,
      orderBy: { gameId: 'desc' },
      select: { gameId: true },
    }),
  ])
  const latestMatchTimestamp = latest?.playedAt?.toISOString() ?? null
  const latestSourceUpdatedAt = latest?.updatedAt?.toISOString() ?? null
  const maxMatchId = maxGame?.gameId ?? null
  const value = hashStable({
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    matchMode,
    matchCount,
    maxMatchId,
    latestMatchTimestamp,
    latestSourceUpdatedAt,
    benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
    metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
  })
  return {
    value,
    matchCount,
    maxMatchId,
    latestMatchTimestamp,
    latestSourceUpdatedAt,
  }
}

function isSnapshotStatus(value: unknown): value is CharacterGradeSnapshotStatus {
  return (
    value === 'ready' ||
    value === 'stale' ||
    value === 'refreshing' ||
    value === 'unavailable' ||
    value === 'insufficient-data'
  )
}

function parseCharacterStats(value: unknown): SeasonCharacterAggregateContract[] | null {
  if (!Array.isArray(value)) return null
  if (
    !value.every(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as { characterNum?: unknown }).characterNum === 'number' &&
        typeof (row as { games?: unknown }).games === 'number',
    )
  ) {
    return null
  }
  return value as SeasonCharacterAggregateContract[]
}

export async function readCharacterGradeSnapshot(
  prisma: PrismaClient,
  params: {
    canonicalUserNum: number
    apiSeasonId: number
    matchMode?: string
  },
): Promise<CharacterGradeSnapshotRecord | null> {
  const matchMode = params.matchMode ?? CHARACTER_GRADE_MATCH_MODE
  if (!isGradeSupportedMode(matchMode)) return null
  if (!isPrismaCacheModelReady(prisma, 'characterGradeSnapshot')) return null
  const id = characterGradeSnapshotId(params)
  let row: Awaited<ReturnType<PrismaClient['characterGradeSnapshot']['findUnique']>>
  try {
    row = await prisma.characterGradeSnapshot.findUnique({ where: { id } })
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2021') {
      return null
    }
    throw error
  }
  if (!row || !isSnapshotStatus(row.status)) return null
  const characterStats = parseCharacterStats(row.characterStats)
  if (!characterStats) return null
  const metadata =
    typeof row.metadata === 'object' && row.metadata !== null
      ? row.metadata as {
          meta?: PlayerMatchCharacterStatsMetaContract
          overallGradeV2?: OverallGradeV2Contract | null
          overallAnalysisAxes?: ProductionAnalysisAxesContract | null
        }
      : null
  const meta = metadata?.meta
  if (!meta) return null
  return {
    id: row.id,
    uid: row.uid,
    canonicalUserNum: Number(row.canonicalUserNum),
    apiSeasonId: row.apiSeasonId,
    displaySeasonId: row.displaySeasonId,
    matchMode: row.matchMode,
    benchmarkVersion: row.benchmarkVersion,
    metricPresetVersion: row.metricPresetVersion,
    sourceFingerprint: row.sourceFingerprint,
    status: row.status,
    computedAt: row.computedAt.toISOString(),
    characterStats,
    meta,
    overallGradeV2: metadata?.overallGradeV2 ?? null,
    overallAnalysisAxes: metadata?.overallAnalysisAxes ?? null,
  }
}

export async function writeCharacterGradeSnapshot(
  prisma: PrismaClient,
  params: {
    uid: string
    canonicalUserNum: number
    apiSeasonId: number
    displaySeasonId: number
    matchMode?: string
    sourceFingerprint: string
    status: CharacterGradeSnapshotStatus
    characterStats: SeasonCharacterAggregateContract[]
    meta: PlayerMatchCharacterStatsMetaContract
    overallGradeV2?: OverallGradeV2Contract | null
    overallAnalysisAxes?: ProductionAnalysisAxesContract | null
    computedAt?: Date
  },
): Promise<void> {
  const matchMode = params.matchMode ?? CHARACTER_GRADE_MATCH_MODE
  if (!isGradeSupportedMode(matchMode)) return
  if (!isPrismaCacheModelReady(prisma, 'characterGradeSnapshot')) return
  const id = characterGradeSnapshotId({
    canonicalUserNum: params.canonicalUserNum,
    apiSeasonId: params.apiSeasonId,
    matchMode,
  })
  const computedAt = params.computedAt ?? new Date()
  const metadata = {
    meta: {
      ...params.meta,
      snapshotStatus: params.status,
      benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
      metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
      sourceFingerprint: params.sourceFingerprint,
      computedAt: computedAt.toISOString(),
    },
    overallGradeV2: (params.overallGradeV2 ?? null) as unknown as Prisma.InputJsonValue,
    overallAnalysisAxes: (params.overallAnalysisAxes ?? null) as unknown as Prisma.InputJsonValue,
  } satisfies Prisma.InputJsonObject

  await prisma.$transaction(async (tx) => {
    await tx.characterGradeSnapshot.upsert({
      where: { id },
      create: {
        id,
        uid: params.uid,
        canonicalUserNum: BigInt(params.canonicalUserNum),
        apiSeasonId: params.apiSeasonId,
        displaySeasonId: params.displaySeasonId,
        matchMode,
        benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
        metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
        sourceFingerprint: params.sourceFingerprint,
        status: params.status,
        characterStats: params.characterStats as unknown as Prisma.InputJsonValue,
        metadata,
        computedAt,
      },
      update: {
        uid: params.uid,
        canonicalUserNum: BigInt(params.canonicalUserNum),
        displaySeasonId: params.displaySeasonId,
        sourceFingerprint: params.sourceFingerprint,
        status: params.status,
        characterStats: params.characterStats as unknown as Prisma.InputJsonValue,
        metadata,
        computedAt,
      },
    })
  })
}
