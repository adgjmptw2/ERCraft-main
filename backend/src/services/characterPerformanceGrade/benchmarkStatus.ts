import baselineDoc from '../../data/characterGrade/tier-baselines.v1.json' with { type: 'json' }
import type { PrismaClient } from '@prisma/client'

import { GRADE_BASELINE_TIER_KEYS, type GradeBaselineTierKey } from './config.js'
import { lookupCharacterWeaponRole } from './baselineStore.js'
import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
} from './config.js'
import { toCurveRole, type RoleTimeCurveRole } from '../../analysis/roleTimeCurve/roleTimeCurve.js'
import { resolveSupportSubtype } from './supportSubtype.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import {
  MATCH_GRADE_PERCENTILE_CALIBRATION_VERSION,
  MATCH_GRADE_VERSION,
} from './compute.js'
import { resolveCharacterGradeBenchmarkSource } from './benchmarkSource.js'
import type { CharacterGradeBenchmarkSource } from './benchmarkSource.js'
import { TEAM_LUCK_ROLE_SCORE_BASELINE_VERSION } from '../roleScore/teamLuckRoleScoreBaseline.js'
import { TEAM_LUCK_ROLE_SCORE_VERSION } from '../roleScore/teamLuckRoleScore.js'
import {
  ROLE_SCORE_V3_DURATION_ADJUSTMENT_VERSION,
  ROLE_SCORE_V3_FALLBACK_BASELINE_VERSION,
  ROLE_SCORE_V3_DAMAGE_TIME_GLOBAL_VERSION,
  ROLE_SCORE_V3_METRIC_ADJUSTMENT_VERSION,
  ROLE_SCORE_V3_VERSION,
  PLACEMENT_ADJUSTMENT_VERSION,
} from '../roleScore/roleScoreV3.js'
import {
  TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
  TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
} from '../teamPerformance.js'
import { MATCH_GRADE_RUNTIME_VERSION } from '../gradeRuntimeConfig.js'
import { aggregateGradeVersions } from '../aggregateGrade.js'

const TIER_LABELS: Record<GradeBaselineTierKey, string> = {
  iron: '아이언',
  bronze: '브론즈',
  silver: '실버',
  gold: '골드',
  platinum: '플래티넘',
  platinum_plus: '플래티넘+',
  diamond_plus: '다이아+',
  meteorite_plus: '메테오라이트+',
  mithril_plus: '미스릴+',
  in1000: '상위 1000',
}

const LOCAL_TIER_ORDER = [
  'iron',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'platinum_plus',
  'diamond_plus',
  'meteorite_plus',
  'mithril_plus',
  'in1000',
] as const

const LOCAL_TIER_LABELS: Record<(typeof LOCAL_TIER_ORDER)[number], string> = {
  iron: '아이언',
  bronze: '브론즈',
  silver: '실버',
  gold: '골드',
  platinum: '플래티넘',
  platinum_plus: '플래티넘+',
  diamond_plus: '다이아+',
  meteorite_plus: '메테오라이트+',
  mithril_plus: '미스릴+',
  in1000: '상위 1000',
}

interface BaselineRow {
  count?: number
}

const combinations = baselineDoc.combinations as Record<string, BaselineRow>

function summarizeTier(tierKey: GradeBaselineTierKey): {
  tierKey: GradeBaselineTierKey
  label: string
  games: number
  combinations: number
} {
  const prefix = `${tierKey}:`
  let games = 0
  let combinationCount = 0
  for (const [key, row] of Object.entries(combinations)) {
    if (!key.startsWith(prefix)) continue
    combinationCount += 1
    if (typeof row.count === 'number' && Number.isFinite(row.count)) {
      games += row.count
    }
  }

  return {
    tierKey,
    label: TIER_LABELS[tierKey],
    games,
    combinations: combinationCount,
  }
}

export interface CharacterGradeBenchmarkStatus {
  activeSource: CharacterGradeBenchmarkSource
  configuredSource: string
  sourceValid: boolean
  sourceReason: ReturnType<typeof resolveCharacterGradeBenchmarkSource>['reason']
  benchmarkVersion: string
  metricPresetVersion: string
  roleScoreVersion: string
  roleScoreBaselineVersion: string
  matchGradeVersion: string
  matchGradeCalibrationVersion: string
  teamMetricVersion: string
  residualBaselineVersion: string
  aggregateGradeVersion: string
  characterAggregateGradeVersion: string
  overallAggregateGradeVersion: string
  aggregateGradeCutVersion: string
  aggregateShrinkVersion: string
  aggregateShrinkK: number
  placementAdjustmentVersion: string
  supportedModes: string[]
  unsupportedModes: string[]
  collectedGames: {
    total: number
    byTier: ReturnType<typeof summarizeTier>[]
  }
  localCollectedGames?: LocalCollectedGamesStatus
  live: {
    mode: 'standard' | 'validation' | 'fallback'
    roleMetrics: 'stable' | 'validation'
    combatMetrics: 'stable' | 'validation'
    snapshot: 'ready' | 'fallback'
    message: string
  }
}

export type LocalBenchmarkRole =
  | Exclude<RoleTimeCurveRole, '유틸 서포터'>
  | '힐러 서포터'
  | '유틸 서포터'

export interface LocalCollectedGamesUnknownBreakdown {
  noWeapon: number
  unmappedCombo: number
  topUnmappedCombos: Array<{ combo: string; count: number }>
}

export interface LocalCollectedGamesStatus {
  source: 'playerMatch'
  total: number
  byTier: Array<{ tierKey: string; label: string; games: number; combinations: number }>
  byRole: Array<{ role: LocalBenchmarkRole; games: number }>
  unknownBreakdown: LocalCollectedGamesUnknownBreakdown
  generatedAt: string
  recentMatchesLastHour: number
  matchesPerMinute: number | null
  collectionWindowMinutes: number
  note: string
}

export function getCharacterGradeBenchmarkStatus(): CharacterGradeBenchmarkStatus {
  const byTier = GRADE_BASELINE_TIER_KEYS.map(summarizeTier)
  const total = byTier.reduce((sum, row) => sum + row.games, 0)
  const source = resolveCharacterGradeBenchmarkSource()
  const experimental = source.liveRoleCombatEnabled
  const aggregate = aggregateGradeVersions()

  return {
    activeSource: source.effective,
    configuredSource: source.configured,
    sourceValid: source.valid,
    sourceReason: source.reason,
    benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
    metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
    roleScoreVersion:
      MATCH_GRADE_RUNTIME_VERSION === 'v3-direct' ? ROLE_SCORE_V3_VERSION : TEAM_LUCK_ROLE_SCORE_VERSION,
    roleScoreBaselineVersion:
      MATCH_GRADE_RUNTIME_VERSION === 'v3-direct'
        ? `${ROLE_SCORE_V3_FALLBACK_BASELINE_VERSION}+${ROLE_SCORE_V3_DURATION_ADJUSTMENT_VERSION}+${ROLE_SCORE_V3_DAMAGE_TIME_GLOBAL_VERSION}+${ROLE_SCORE_V3_METRIC_ADJUSTMENT_VERSION}`
        : TEAM_LUCK_ROLE_SCORE_BASELINE_VERSION,
    matchGradeVersion: MATCH_GRADE_VERSION,
    matchGradeCalibrationVersion: MATCH_GRADE_PERCENTILE_CALIBRATION_VERSION,
    teamMetricVersion: TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
    residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
    aggregateGradeVersion: aggregate.calibrationVersion,
    characterAggregateGradeVersion: aggregate.characterAggregateGradeVersion,
    overallAggregateGradeVersion: aggregate.overallAggregateGradeVersion,
    aggregateGradeCutVersion: aggregate.aggregateGradeCutVersion,
    aggregateShrinkVersion: aggregate.aggregateShrinkVersion,
    aggregateShrinkK: aggregate.shrinkK,
    placementAdjustmentVersion: PLACEMENT_ADJUSTMENT_VERSION,
    supportedModes: ['rank'],
    unsupportedModes: ['cobalt'],
    collectedGames: {
      total,
      byTier,
    },
    live: {
      mode: experimental ? 'validation' : source.effective === 'legacy' ? 'fallback' : 'standard',
      roleMetrics: experimental ? 'validation' : 'stable',
      combatMetrics: experimental ? 'validation' : 'stable',
      snapshot: source.reason === 'unsupported-value' ? 'fallback' : 'ready',
      message: experimental
        ? '실험 기준선 검증 모드'
        : '동일 조건 통계 기준으로 운영 중',
    },
  }
}

function emptyRoleCounts(): Record<LocalBenchmarkRole, number> {
  return {
    '평타 딜러': 0,
    '스증 딜러': 0,
    암살자: 0,
    브루저: 0,
    탱커: 0,
    '힐러 서포터': 0,
    '유틸 서포터': 0,
    unknown: 0,
  }
}

function toLocalBenchmarkRole(
  characterNum: number,
  bestWeapon: number | null,
): { role: LocalBenchmarkRole; unknownReason: 'noWeapon' | 'unmappedCombo' | null; comboKey: string | null } {
  if (bestWeapon == null || bestWeapon <= 0) {
    return { role: 'unknown', unknownReason: 'noWeapon', comboKey: null }
  }
  const mappedRole = lookupCharacterWeaponRole(characterNum, bestWeapon)
  if (mappedRole == null) {
    return {
      role: 'unknown',
      unknownReason: 'unmappedCombo',
      comboKey: `${characterNum}:${bestWeapon}`,
    }
  }
  if (mappedRole === '서포터') {
    const subtype = resolveSupportSubtype(characterNum, bestWeapon, mappedRole)
    return {
      role: subtype === 'healer' ? '힐러 서포터' : '유틸 서포터',
      unknownReason: null,
      comboKey: null,
    }
  }
  return { role: toCurveRole(mappedRole), unknownReason: null, comboKey: null }
}

function localTierKey(rpAfter: number | null, displaySeasonId: number): (typeof LOCAL_TIER_ORDER)[number] | null {
  if (rpAfter == null || !Number.isFinite(rpAfter) || rpAfter <= 0) return null
  const tier = getRankTierFromRp(rpAfter, null, displaySeasonId).tierNameKo
  switch (tier) {
    case '아이언':
      return 'iron'
    case '브론즈':
      return 'bronze'
    case '실버':
      return 'silver'
    case '골드':
      return 'gold'
    case '플래티넘':
      return 'platinum'
    case '다이아몬드':
      return 'diamond_plus'
    case '메테오라이트':
      return 'meteorite_plus'
    case '미스릴':
    case '데미갓':
    case '이터니티':
      return 'mithril_plus'
    default:
      return null
  }
}

export async function getLocalCollectedGamesStatus(
  prisma: PrismaClient,
): Promise<LocalCollectedGamesStatus | null> {
  if (!('playerMatch' in prisma) || !prisma.playerMatch) return null
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank' },
    select: {
      displaySeasonId: true,
      rpAfter: true,
      characterNum: true,
      bestWeapon: true,
    },
  })
  const byTier = new Map<(typeof LOCAL_TIER_ORDER)[number], { games: number; combos: Set<string> }>()
  for (const tierKey of LOCAL_TIER_ORDER) {
    byTier.set(tierKey, { games: 0, combos: new Set<string>() })
  }
  const roleCounts = emptyRoleCounts()
  const unmappedComboCounts = new Map<string, number>()
  let unknownNoWeapon = 0
  let unknownUnmapped = 0
  for (const row of rows) {
    const tierKey = localTierKey(row.rpAfter, row.displaySeasonId)
    if (tierKey) {
      const bucket = byTier.get(tierKey)!
      bucket.games += 1
      bucket.combos.add(`${row.characterNum}:${row.bestWeapon ?? 0}`)
    }
    const mapped = toLocalBenchmarkRole(row.characterNum, row.bestWeapon)
    roleCounts[mapped.role] += 1
    if (mapped.unknownReason === 'noWeapon') unknownNoWeapon += 1
    if (mapped.unknownReason === 'unmappedCombo') {
      unknownUnmapped += 1
      if (mapped.comboKey) {
        unmappedComboCounts.set(mapped.comboKey, (unmappedComboCounts.get(mapped.comboKey) ?? 0) + 1)
      }
    }
  }

  const topUnmappedCombos = [...unmappedComboCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([combo, count]) => ({ combo, count }))

  const collectionWindowMinutes = 60
  const since = new Date(Date.now() - collectionWindowMinutes * 60 * 1000)
  const recentMatchesLastHour = await prisma.playerMatch.count({
    where: { gameMode: 'rank', createdAt: { gte: since } },
  })
  const matchesPerMinute =
    recentMatchesLastHour > 0
      ? Math.round((recentMatchesLastHour / collectionWindowMinutes) * 100) / 100
      : null

  return {
    source: 'playerMatch',
    total: rows.length,
    byTier: LOCAL_TIER_ORDER.map((tierKey) => {
      const bucket = byTier.get(tierKey)!
      return {
        tierKey,
        label: LOCAL_TIER_LABELS[tierKey],
        games: bucket.games,
        combinations: bucket.combos.size,
      }
    }),
    byRole: Object.entries(roleCounts).map(([role, games]) => ({
      role: role as LocalBenchmarkRole,
      games,
    })),
    unknownBreakdown: {
      noWeapon: unknownNoWeapon,
      unmappedCombo: unknownUnmapped,
      topUnmappedCombos,
    },
    generatedAt: new Date().toISOString(),
    recentMatchesLastHour,
    matchesPerMinute,
    collectionWindowMinutes,
    note: 'Local PlayerMatch rank rows only; not DAK.GG benchmark counts.',
  }
}
