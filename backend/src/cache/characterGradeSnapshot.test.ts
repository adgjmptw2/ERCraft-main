import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import {
  computeCharacterGradeSourceFingerprint,
  readCharacterGradeSnapshot,
  snapshotNeedsGradeTierRecompute,
  writeCharacterGradeSnapshot,
} from './characterGradeSnapshot.js'
import { getRankTierFromRp } from '../utils/rankTier.js'

function createPrismaMock() {
  return {
    playerMatch: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    characterGradeSnapshot: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient
}

describe('characterGradeSnapshot cobalt guard', () => {
  it('티어가 있는데 스냅샷이 missing-baseline이면 재계산 필요', () => {
    const playerTier = getRankTierFromRp(6400)
    expect(
      snapshotNeedsGradeTierRecompute({
        characterStats: [{ gradeStatus: 'missing-baseline' }],
        playerTier,
        storedPlayerTierKey: null,
      }),
    ).toBe(true)
  })

  it('저장된 티어 키와 현재 티어 키가 다르면 재계산 필요', () => {
    const playerTier = getRankTierFromRp(7600)
    expect(
      snapshotNeedsGradeTierRecompute({
        characterStats: [{ gradeStatus: 'ok' }],
        playerTier,
        storedPlayerTierKey: 'diamond_plus',
      }),
    ).toBe(true)
  })

  it('티어를 알 수 없으면 재계산하지 않음', () => {
    expect(
      snapshotNeedsGradeTierRecompute({
        characterStats: [{ gradeStatus: 'missing-baseline' }],
        playerTier: null,
      }),
    ).toBe(false)
  })

  it('코발트 fingerprint는 PlayerMatch를 조회하지 않음', async () => {
    const prisma = createPrismaMock()

    const fingerprint = await computeCharacterGradeSourceFingerprint(prisma, {
      uid: 'uid-1',
      apiSeasonId: 39,
      matchMode: 'cobalt',
    })

    expect(fingerprint).toEqual({
      value: 'unsupported-mode:cobalt',
      matchCount: 0,
      maxMatchId: null,
      latestMatchTimestamp: null,
      latestSourceUpdatedAt: null,
    })
    expect(prisma.playerMatch.count).not.toHaveBeenCalled()
    expect(prisma.playerMatch.findFirst).not.toHaveBeenCalled()
  })

  it('코발트 snapshot read/write는 DB를 호출하지 않음', async () => {
    const prisma = createPrismaMock()

    await expect(
      readCharacterGradeSnapshot(prisma, {
        canonicalUserNum: 123,
        apiSeasonId: 39,
        matchMode: 'cobalt',
      }),
    ).resolves.toBeNull()

    await writeCharacterGradeSnapshot(prisma, {
      uid: 'uid-1',
      canonicalUserNum: 123,
      apiSeasonId: 39,
      displaySeasonId: 11,
      matchMode: 'cobalt',
      sourceFingerprint: 'ignored',
      status: 'ready',
      characterStats: [],
      meta: {
        status: 'complete',
        userNum: 123,
        seasonId: 11,
        generatedAt: '2026-06-20T00:00:00.000Z',
        rowCount: 0,
        matchCount: 0,
      },
    })

    expect(prisma.characterGradeSnapshot.findUnique).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('overall V2 payload를 metadata에 저장하고 DB-first로 복원', async () => {
    const prisma = createPrismaMock()
    const tx = {
      characterGradeSnapshot: {
        upsert: vi.fn(),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const run = fn as (client: typeof tx) => Promise<void>
      await run(tx)
    })

    await writeCharacterGradeSnapshot(prisma, {
      uid: 'uid-1',
      canonicalUserNum: 123,
      apiSeasonId: 39,
      displaySeasonId: 11,
      matchMode: 'rank',
      sourceFingerprint: 'fingerprint-1',
      status: 'ready',
      characterStats: [{ characterNum: 1, games: 10 } as never],
      meta: {
        status: 'complete',
        snapshotStatus: 'ready',
        userNum: 123,
        seasonId: 11,
        generatedAt: '2026-06-20T00:00:00.000Z',
        rowCount: 1,
        matchCount: 10,
      },
      overallGradeV2: {
        overallGradeVersion: 'overall-grade-v2-hybrid.v1',
        overallPerformanceScore: 70,
        overallGrade: 'B',
        overallScoreSource: 'overall-v2-hybrid',
        basePerformanceScore: 72,
        outcomePerformanceScore: 55,
        consistencyScore: 65,
        outcomeModifier: -2,
        consistencyModifier: 0,
        totalModifier: -2,
        overallConfidence: 0.8,
        overallConfidenceLabel: 'high',
        weightedMatchCount: 10,
        gradedCharacterCount: 1,
      },
    })

    const upsertArg = tx.characterGradeSnapshot.upsert.mock.calls[0]?.[0]
    expect(upsertArg?.create.metadata.overallGradeV2).toMatchObject({
      overallGradeVersion: 'overall-grade-v2-hybrid.v1',
      overallScoreSource: 'overall-v2-hybrid',
    })

    vi.mocked(prisma.characterGradeSnapshot.findUnique).mockResolvedValue({
      id: '123:39:rank:tier-baselines.v1-fixed-legacy.v1:grade-calibration.v2',
      uid: 'uid-1',
      canonicalUserNum: BigInt(123),
      apiSeasonId: 39,
      displaySeasonId: 11,
      matchMode: 'rank',
      benchmarkVersion: 'tier-baselines.v1-fixed-legacy.v1',
      metricPresetVersion: 'grade-calibration.v2',
      sourceFingerprint: 'fingerprint-1',
      status: 'ready',
      characterStats: [{ characterNum: 1, games: 10 }],
      metadata: upsertArg?.create.metadata,
      computedAt: new Date('2026-06-20T00:00:00.000Z'),
      createdAt: new Date('2026-06-20T00:00:00.000Z'),
      updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    })

    await expect(
      readCharacterGradeSnapshot(prisma, {
        canonicalUserNum: 123,
        apiSeasonId: 39,
        matchMode: 'rank',
      }),
    ).resolves.toMatchObject({
      overallGradeV2: {
        overallPerformanceScore: 70,
        overallScoreSource: 'overall-v2-hybrid',
      },
    })
  })
})
