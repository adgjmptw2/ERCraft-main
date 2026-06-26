import residualBaselineDoc from '../data/teamLuckResidual/team-luck-residual-baselines.v3.json' with { type: 'json' }

export const TEAM_LUCK_RESIDUAL_BASELINE_VERSION = residualBaselineDoc.baselineVersion
export const TEAM_LUCK_RESIDUAL_WEATHER_THRESHOLDS = residualBaselineDoc.config.weatherThresholds

const MIN_SAMPLE_COUNT = residualBaselineDoc.config.minimumSampleCount
const SHRINKAGE_K = residualBaselineDoc.config.shrinkageK
export const RESIDUAL_FALLBACK_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4'] as const

export type ResidualFallbackLevel = (typeof RESIDUAL_FALLBACK_LEVELS)[number]
export type ResidualConfidence = 'high' | 'medium' | 'low'

export interface ResidualBaselineLookupInput {
  season: number
  mode: string
  tier: string
  characterNum: number
  weaponTypeId: number
  role: string
  placement: number
  durationSeconds: number
}

export interface ResidualBaselineLookupResult {
  expectedRolePerformanceScore: number | null
  fallbackLevel: ResidualFallbackLevel | null
  sampleCount: number | null
  confidence: ResidualConfidence
  levelSampleCounts: Record<ResidualFallbackLevel, number>
  levelKeys: Record<ResidualFallbackLevel, string>
  reason?: 'invalid-bucket' | 'baseline-unavailable'
}

type LevelRecord = {
  sampleCount: number
  means: {
    rolePerformanceScore?: number | null
  }
}

type LevelMap = Record<string, LevelRecord>

const levels = residualBaselineDoc.levels as Record<ResidualFallbackLevel, LevelMap>

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function residualPlacementBucket(placement: number | null | undefined): string {
  if (!isFiniteNumber(placement) || placement <= 0) return 'unknown-place'
  if (placement === 1) return 'place-1'
  if (placement <= 3) return 'place-2-3'
  if (placement <= 6) return 'place-4-6'
  return 'place-7-plus'
}

export function residualDurationBucket(seconds: number | null | undefined): string {
  if (!isFinitePositiveNumber(seconds)) return 'unknown-duration'
  const minutes = seconds / 60
  if (minutes < 15) return 'duration-lt-15m'
  if (minutes < 20) return 'duration-15-20m'
  if (minutes < 25) return 'duration-20-25m'
  if (minutes < 30) return 'duration-25-30m'
  return 'duration-30m-plus'
}

export function residualLevelKey(
  level: ResidualFallbackLevel,
  params: {
    season: number
    mode: string
    tier: string
    characterNum: number
    weaponTypeId: number
    role: string
    placementBucket: string
    durationBucket: string
  },
): string {
  const base = [
    `season:${params.season}`,
    `mode:${params.mode}`,
    `place:${params.placementBucket}`,
    `duration:${params.durationBucket}`,
  ]
  if (level === 'L4') return base.join('|')
  if (level === 'L3') return [...base, `role:${params.role}`].join('|')
  if (level === 'L2') return [...base, `role:${params.role}`, `tier:${params.tier}`].join('|')
  if (level === 'L1') {
    return [
      ...base,
      `role:${params.role}`,
      `tier:${params.tier}`,
      `character:${params.characterNum}`,
    ].join('|')
  }
  return [
    ...base,
    `role:${params.role}`,
    `tier:${params.tier}`,
    `character:${params.characterNum}`,
    `weapon:${params.weaponTypeId}`,
  ].join('|')
}

function shrinkMetric(
  levelValue: number | null,
  parentValue: number | null,
  sampleCount: number,
): number | null {
  if (sampleCount <= 0) return parentValue
  if (levelValue == null) return parentValue
  if (parentValue == null) return levelValue
  return (
    (sampleCount / (sampleCount + SHRINKAGE_K)) * levelValue +
    (SHRINKAGE_K / (sampleCount + SHRINKAGE_K)) * parentValue
  )
}

function pickFallbackLevel(
  levelSampleCounts: Record<ResidualFallbackLevel, number>,
): ResidualFallbackLevel {
  for (const level of RESIDUAL_FALLBACK_LEVELS) {
    if (levelSampleCounts[level] >= MIN_SAMPLE_COUNT) return level
  }
  return 'L4'
}

export function residualConfidenceForFallback(
  fallbackLevel: ResidualFallbackLevel | null,
): ResidualConfidence {
  if (fallbackLevel === 'L0') return 'high'
  if (fallbackLevel === 'L1' || fallbackLevel === 'L2') return 'medium'
  return 'low'
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function resolveResidualRoleBaseline(
  input: ResidualBaselineLookupInput,
): ResidualBaselineLookupResult {
  const placementBucket = residualPlacementBucket(input.placement)
  const durationBucket = residualDurationBucket(input.durationSeconds)
  const levelSampleCounts = Object.fromEntries(
    RESIDUAL_FALLBACK_LEVELS.map((level) => [level, 0]),
  ) as Record<ResidualFallbackLevel, number>
  const levelKeys = Object.fromEntries(
    RESIDUAL_FALLBACK_LEVELS.map((level) => [
      level,
      residualLevelKey(level, { ...input, placementBucket, durationBucket }),
    ]),
  ) as Record<ResidualFallbackLevel, string>

  if (placementBucket === 'unknown-place' || durationBucket === 'unknown-duration') {
    return {
      expectedRolePerformanceScore: null,
      fallbackLevel: null,
      sampleCount: null,
      confidence: 'low',
      levelSampleCounts,
      levelKeys,
      reason: 'invalid-bucket',
    }
  }

  const means = Object.fromEntries(
    RESIDUAL_FALLBACK_LEVELS.map((level) => {
      const record = levels[level]?.[levelKeys[level]]
      levelSampleCounts[level] = record?.sampleCount ?? 0
      return [level, record?.means.rolePerformanceScore ?? null]
    }),
  ) as Record<ResidualFallbackLevel, number | null>

  let expected = means.L4
  for (const level of ['L3', 'L2', 'L1', 'L0'] as const) {
    const sampleCount = levelSampleCounts[level]
    expected =
      sampleCount >= MIN_SAMPLE_COUNT
        ? means[level]
        : shrinkMetric(means[level], expected, sampleCount)
  }

  if (expected == null || !Number.isFinite(expected)) {
    return {
      expectedRolePerformanceScore: null,
      fallbackLevel: null,
      sampleCount: null,
      confidence: 'low',
      levelSampleCounts,
      levelKeys,
      reason: 'baseline-unavailable',
    }
  }

  const fallbackLevel = pickFallbackLevel(levelSampleCounts)
  return {
    expectedRolePerformanceScore: round6(expected),
    fallbackLevel,
    sampleCount: levelSampleCounts[fallbackLevel],
    confidence: residualConfidenceForFallback(fallbackLevel),
    levelSampleCounts,
    levelKeys,
  }
}
