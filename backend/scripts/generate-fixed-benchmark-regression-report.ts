import 'dotenv/config'

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PrismaClient } from '@prisma/client'

import type {
  MatchSummaryContract,
  SeasonCharacterAggregateContract,
} from '../src/contracts/player.js'
import { buildCharacterAggregatesFromMatches } from '../src/cache/seasonAggregateBuilder.js'
import {
  CHARACTER_GRADE_MATCH_MODE,
  computeCharacterGradeSourceFingerprint,
  readCharacterGradeSnapshot,
} from '../src/cache/characterGradeSnapshot.js'
import {
  applyCharacterPerformanceGrades,
  computeMatchPerformanceGrade,
  computeWeaponGroupScore,
  playerMatchRowToGradeInput,
  type StoredMatchGradeRow,
} from '../src/services/characterPerformanceGrade/compute.js'
import {
  applySampleConfidence,
  CHARACTER_GRADE_BENCHMARK_VERSION,
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
  FINE_GRADE_CUTS,
  MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
  MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
  MATCH_GRADE_S_ROLE_SCORE_GATE,
  MIN_GRADE_SAMPLE_GAMES,
  scoreToFineGrade,
  type CharacterFineGrade,
  type CharacterGradeRole,
} from '../src/services/characterPerformanceGrade/config.js'
import {
  aggregateWeaponGroupStats,
  weightedScore,
  type MatchGradeInput,
} from '../src/services/characterPerformanceGrade/metrics.js'
import { lookupCharacterWeaponRole } from '../src/services/characterPerformanceGrade/baselineStore.js'
import {
  resolveCharacterGradeBenchmarkSource,
  type CharacterGradeBenchmarkSource,
} from '../src/services/characterPerformanceGrade/benchmarkSource.js'
import { getCharacterGradeBenchmarkStatus } from '../src/services/characterPerformanceGrade/benchmarkStatus.js'
import { normalizeRankTier, type RankTier } from '../src/utils/rankTier.js'
import { rankTierToGradeBaselineKey } from '../src/services/characterPerformanceGrade/tierKey.js'

type Source = Extract<CharacterGradeBenchmarkSource, 'fixed-v1' | 'experimental-local' | 'legacy'>

const SOURCES: Source[] = ['fixed-v1', 'experimental-local', 'legacy']
const TARGET_NICKNAMES = ['연서', '아드마이할게요', 'gapri'] as const
const API_SEASON_ID = 39
const DISPLAY_SEASON_ID = 11
const REPORT_DIR = resolve(process.cwd(), '..', 'reports', 'fixed-benchmark-regression')

const GRADE_ORDER: CharacterFineGrade[] = [
  'D-',
  'D',
  'D+',
  'C-',
  'C',
  'C+',
  'B-',
  'B',
  'B+',
  'A-',
  'A',
  'A+',
  'S-',
  'S',
  'S+',
]

interface PlayerMatchAuditRow extends StoredMatchGradeRow {
  uid: string
  gameId: string
  apiSeasonId: number
  displaySeasonId: number
  gameMode: string
  playedAt: Date
  characterName: string | null
  rpAfter: number | null
  rpDelta: number | null
  gameDuration: number | null
  cobaltInfusions: unknown
  accountLevel: number | null
  characterLevel: number | null
  skinCode: number | null
  bestWeaponLevel: number | null
  tacticalSkillGroup: number | null
  tacticalSkillLevel: number | null
  traitFirstCore: number | null
  traitFirstSub: unknown
  traitSecondSub: unknown
  equipment: unknown
  equipmentGrade: unknown
  routeIdOfStart: number | null
  routeSlotId: number | null
}

interface MatchGradeAuditRow {
  source: Source
  benchmarkSource: Source
  uid: string
  matchId: string
  tierKey: string | null
  characterNum: number
  characterName: string
  weaponTypeId: number | null
  role: CharacterGradeRole | null
  placement: number | null
  grade: CharacterFineGrade | null
  score: number | null
  outcomeScore: number | null
  roleScore: number | null
  fallbackUsed: boolean
  roleMetricSource: string
  baselineLevel: string
  normalizationSource: string
  combatMetricSource: string
  fallbackReasons: string[]
  blocklisted: boolean
  completeness: string
}

interface CharacterGradeAuditRow {
  source: Source
  benchmarkSource: Source
  uid: string
  characterNum: number
  characterName: string
  games: number
  grade: CharacterFineGrade | null
  score: number | null
  preConfidenceScore: number | null
  gradeStatus: string | null
  tierKey: string | null
  role: string | null
  roleMetricSource: string | null
  combatMetricSource: string | null
  fallbackUsed: boolean
  baselineLevel: string | null
  normalizationSource: string | null
  fallbackReasons: string[]
  blocklisted: boolean
  completeness: string
}

interface OverallAuditRow {
  source: Source
  uid: string
  score: number | null
  grade: CharacterFineGrade | null
  gradedCharacterCount: number
  totalCharacterCount: number
  weightedMatchCount: number
  weightedScoreSum: number
}

interface SourceAudit {
  source: Source
  sourceResolution: ReturnType<typeof resolveCharacterGradeBenchmarkSource>
  matchRows: MatchGradeAuditRow[]
  characterRows: CharacterGradeAuditRow[]
  overallRows: OverallAuditRow[]
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return round(sorted[low])
  const fraction = index - low
  return round(sorted[low] * (1 - fraction) + sorted[high] * fraction)
}

function ratio(count: number, total: number): number {
  if (total <= 0) return 0
  return round(count / total, 4) ?? 0
}

function gradeFamily(grade: CharacterFineGrade | null): 'S' | 'A' | 'B' | 'C 이하' | 'ungraded' {
  if (!grade) return 'ungraded'
  if (grade.startsWith('S')) return 'S'
  if (grade.startsWith('A')) return 'A'
  if (grade.startsWith('B')) return 'B'
  return 'C 이하'
}

function gradeStep(grade: CharacterFineGrade | null): number | null {
  if (!grade) return null
  const index = GRADE_ORDER.indexOf(grade)
  return index >= 0 ? index : null
}

function coarseGrade(grade: CharacterFineGrade | null): string | null {
  if (!grade) return null
  return grade.slice(0, 1)
}

function gradeDistribution<T extends { grade: CharacterFineGrade | null }>(rows: T[]) {
  const total = rows.length
  const graded = rows.filter((row) => row.grade != null)
  const count = (predicate: (grade: CharacterFineGrade) => boolean) =>
    graded.filter((row) => row.grade != null && predicate(row.grade)).length
  return {
    total,
    graded: graded.length,
    ungraded: total - graded.length,
    ungradedRate: ratio(total - graded.length, total),
    sPlusRate: ratio(count((grade) => grade === 'S+'), graded.length),
    sFamilyRate: ratio(count((grade) => grade.startsWith('S')), graded.length),
    aFamilyRate: ratio(count((grade) => grade.startsWith('A')), graded.length),
    bFamilyRate: ratio(count((grade) => grade.startsWith('B')), graded.length),
    cOrLowerRate: ratio(count((grade) => !grade.startsWith('S') && !grade.startsWith('A') && !grade.startsWith('B')), graded.length),
    byGrade: Object.fromEntries(
      GRADE_ORDER.map((grade) => [
        grade,
        graded.filter((row) => row.grade === grade).length,
      ]).filter(([, countValue]) => countValue > 0),
    ),
  }
}

function countBy<T>(rows: T[], keyOf: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyOf(row) ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

function sourceCauseBreakdown<
  T extends {
    benchmarkSource: string
    fallbackUsed: boolean
    baselineLevel?: string | null
    normalizationSource?: string | null
    roleMetricSource?: string | null
    combatMetricSource?: string | null
    fallbackReasons: string[]
    blocklisted: boolean
    completeness: string
  },
>(rows: T[]) {
  return {
    benchmarkSource: countBy(rows, (row) => row.benchmarkSource),
    fallback: {
      exactOrNoneCount: rows.filter((row) => !row.fallbackUsed).length,
      fallbackCount: rows.filter((row) => row.fallbackUsed).length,
      fallbackRate: ratio(rows.filter((row) => row.fallbackUsed).length, rows.length),
    },
    baselineLevel: countBy(rows, (row) => row.baselineLevel),
    normalizationSource: countBy(rows, (row) => row.normalizationSource),
    roleMetricSource: countBy(rows, (row) => row.roleMetricSource),
    combatMetricSource: countBy(rows, (row) => row.combatMetricSource),
    fallbackReasons: countBy(
      rows.flatMap((row) => row.fallbackReasons.length > 0 ? row.fallbackReasons : ['none']),
      (reason) => reason,
    ),
    blocklist: {
      blockedCount: rows.filter((row) => row.blocklisted).length,
      blockedRate: ratio(rows.filter((row) => row.blocklisted).length, rows.length),
    },
    completeness: countBy(rows, (row) => row.completeness),
  }
}

function scoreSummary(values: number[]) {
  return {
    count: values.length,
    mean: mean(values),
    median: percentile(values, 0.5),
    p10: percentile(values, 0.1),
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
  }
}

function sourceScoped<T>(source: Source, fn: () => T): T {
  const previous = process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
  process.env.CHARACTER_GRADE_BENCHMARK_SOURCE = source
  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
    } else {
      process.env.CHARACTER_GRADE_BENCHMARK_SOURCE = previous
    }
  }
}

function matchToSummary(row: PlayerMatchAuditRow, userNum: number): MatchSummaryContract {
  return {
    matchId: row.gameId,
    userNum,
    characterNum: row.characterNum,
    characterName: row.characterName?.trim() ? row.characterName : `실험체 #${row.characterNum}`,
    placement: row.placement ?? 0,
    kills: row.kills ?? 0,
    deaths: row.deaths ?? 0,
    assists: row.assists ?? 0,
    gameStartedAt: row.playedAt.toISOString(),
    victory: row.victory ?? false,
    seasonNumber: row.displaySeasonId,
    rpAfter: row.rpAfter ?? undefined,
    rpDelta: row.rpDelta ?? undefined,
    gameDuration: row.gameDuration ?? undefined,
    teamKills: row.teamKills ?? undefined,
    damageToPlayers: row.damageToPlayer ?? undefined,
    playerDamage: row.damageToPlayer ?? undefined,
    gameMode: row.gameMode === 'rank' || row.gameMode === 'cobalt' || row.gameMode === 'normal' || row.gameMode === 'union'
      ? row.gameMode
      : 'normal',
    bestWeapon: row.bestWeapon ?? undefined,
  }
}

function overallFromCharacters(source: Source, uid: string, rows: CharacterGradeAuditRow[]): OverallAuditRow {
  const included = rows.filter((row) => row.grade != null && row.score != null && row.gradeStatus === 'ok')
  const weightedScoreSum = included.reduce((sum, row) => sum + (row.score ?? 0) * row.games, 0)
  const weightedMatchCount = included.reduce((sum, row) => sum + row.games, 0)
  const score = weightedMatchCount > 0 ? round(weightedScoreSum / weightedMatchCount) : null
  return {
    source,
    uid,
    score,
    grade: score == null ? null : scoreToFineGrade(score),
    gradedCharacterCount: included.length,
    totalCharacterCount: rows.length,
    weightedMatchCount,
    weightedScoreSum: round(weightedScoreSum) ?? 0,
  }
}

function primaryWeaponGroup(groups: Map<number, MatchGradeInput[]>): { weaponTypeId: number; matches: MatchGradeInput[] } | null {
  let best: { weaponTypeId: number; matches: MatchGradeInput[] } | null = null
  for (const [weaponTypeId, matches] of groups) {
    if (!best || matches.length > best.matches.length) {
      best = { weaponTypeId, matches }
    }
  }
  return best
}

function preConfidenceScoreForCharacter(
  characterNum: number,
  rows: PlayerMatchAuditRow[],
  tier: RankTier | null,
): number | null {
  if (!tier) return null
  const tierKey = rankTierToGradeBaselineKey(tier)
  const groups = new Map<number, MatchGradeInput[]>()
  for (const row of rows) {
    if (row.gameMode !== 'rank' || row.characterNum !== characterNum) continue
    const input = playerMatchRowToGradeInput(row as never)
    if (!input || input.weaponTypeId == null || input.weaponTypeId <= 0) continue
    const bucket = groups.get(input.weaponTypeId) ?? []
    bucket.push(input)
    groups.set(input.weaponTypeId, bucket)
  }
  const sampleSize = [...groups.values()].reduce((sum, group) => sum + group.length, 0)
  if (sampleSize < MIN_GRADE_SAMPLE_GAMES) return null
  const scored = [...groups.entries()].flatMap(([weaponTypeId, group]) => {
    const role = lookupCharacterWeaponRole(characterNum, weaponTypeId)
    if (!role) return []
    const stats = aggregateWeaponGroupStats(characterNum, weaponTypeId, group)
    if (!stats) return []
    const score = computeWeaponGroupScore(stats, role, tierKey, group, DISPLAY_SEASON_ID)
    if (!score || !Number.isFinite(score.rawScore)) return []
    return [{ score: score.rawScore, weight: group.length }]
  })
  return round(weightedScore(scored))
}

function analyzeSource(
  source: Source,
  rows: PlayerMatchAuditRow[],
  tierByUid: Map<string, RankTier>,
  userNumByUid: Map<string, number>,
): SourceAudit {
  return sourceScoped(source, () => {
    const matchRows: MatchGradeAuditRow[] = rows.map((row) => {
      const playerTier = tierByUid.get(row.uid) ?? null
      const result = computeMatchPerformanceGrade({
        row,
        playerTier,
        displaySeasonId: row.displaySeasonId,
      })
      const input = playerMatchRowToGradeInput(row as never)
      const role = input?.weaponTypeId
        ? lookupCharacterWeaponRole(row.characterNum, input.weaponTypeId)
        : null
      return {
        source,
        benchmarkSource: source,
        uid: row.uid,
        matchId: row.gameId,
        tierKey: result.matchGradeBaselineTierKey,
        characterNum: row.characterNum,
        characterName: row.characterName?.trim() ? row.characterName : `실험체 #${row.characterNum}`,
        weaponTypeId: row.bestWeapon ?? null,
        role,
        placement: row.placement,
        grade: result.matchGrade,
        score: result.matchGradeScore,
        outcomeScore: result.matchGradeOutcomeScore ?? null,
        roleScore: result.matchGradeRoleScore ?? null,
        fallbackUsed: result.matchGradeUsedFallback,
        roleMetricSource: source === 'experimental-local' ? 'experimental-local-enabled' : 'legacy',
        baselineLevel: result.matchGradeFallback?.baselineLevel ?? 'none',
        normalizationSource: result.matchGradeFallback?.normalization ?? 'none',
        combatMetricSource: result.matchGradeFallback?.combat ?? 'none',
        fallbackReasons: result.matchGradeFallback?.reasons ?? [],
        blocklisted: result.matchGradeFallback?.combat === 'blocked-exact-key',
        completeness: result.matchGrade == null ? 'uncomputed' : 'computed',
      }
    })

    const rowsByUid = new Map<string, PlayerMatchAuditRow[]>()
    for (const row of rows) {
      const bucket = rowsByUid.get(row.uid) ?? []
      bucket.push(row)
      rowsByUid.set(row.uid, bucket)
    }

    const characterRows: CharacterGradeAuditRow[] = []
    const overallRows: OverallAuditRow[] = []
    for (const [uid, userRows] of rowsByUid) {
      const userNum = userNumByUid.get(uid) ?? 0
      const tier = tierByUid.get(uid) ?? null
      const summaries = userRows.map((row) => matchToSummary(row, userNum))
      const aggregates = buildCharacterAggregatesFromMatches(
        summaries,
        DISPLAY_SEASON_ID,
        API_SEASON_ID,
      )
      const graded = applyCharacterPerformanceGrades({
        rows: userRows as never,
        characterStats: aggregates,
        metaStatus: 'complete',
        playerTier: tier,
      })
      const sourceCharacterRows = graded.map((row): CharacterGradeAuditRow => {
        const preConfidenceScore = preConfidenceScoreForCharacter(row.characterNum, userRows, tier)
        return {
          source,
          benchmarkSource: source,
          uid,
          characterNum: row.characterNum,
          characterName: row.characterName ?? `실험체 #${row.characterNum}`,
          games: row.games,
          grade: row.grade ?? null,
          score: row.gradeScore ?? null,
          preConfidenceScore,
          gradeStatus: row.gradeStatus ?? null,
          tierKey: row.gradeBaselineTierKey ?? null,
          role: row.gradeRole ?? null,
          roleMetricSource: row.gradeRoleMetricMode ?? null,
          combatMetricSource: row.gradeCombatMetricMode ?? null,
          fallbackUsed: row.gradeUsedFallback ?? false,
          baselineLevel: row.gradeFallback?.baselineLevel ?? null,
          normalizationSource: row.gradeFallback?.normalization ?? null,
          fallbackReasons: row.gradeFallback?.reasons ?? [],
          blocklisted: row.gradeFallback?.combat === 'blocked-exact-key',
          completeness: row.gradeStatus ?? 'unknown',
        }
      })
      characterRows.push(...sourceCharacterRows)
      overallRows.push(overallFromCharacters(source, uid, sourceCharacterRows))
    }

    return {
      source,
      sourceResolution: resolveCharacterGradeBenchmarkSource(source),
      matchRows,
      characterRows,
      overallRows,
    }
  })
}

function sourceSummary(audit: SourceAudit) {
  const scores = audit.matchRows.flatMap((row) => row.score == null ? [] : [row.score])
  const characterScores = audit.characterRows.flatMap((row) => row.score == null ? [] : [row.score])
  const overallScores = audit.overallRows.flatMap((row) => row.score == null ? [] : [row.score])
  const first = audit.matchRows.filter((row) => row.placement === 1)
  const top23 = audit.matchRows.filter((row) => row.placement === 2 || row.placement === 3)
  return {
    source: audit.source,
    resolution: audit.sourceResolution,
    matches: {
      scores: scoreSummary(scores),
      distribution: gradeDistribution(audit.matchRows),
      fallbackRate: ratio(audit.matchRows.filter((row) => row.fallbackUsed).length, audit.matchRows.length),
      sourceCauses: sourceCauseBreakdown(audit.matchRows),
      firstPlaceSOrHigherRate: ratio(first.filter((row) => row.grade?.startsWith('S')).length, first.length),
      firstPlaceAFamilyRate: ratio(first.filter((row) => row.grade?.startsWith('A')).length, first.length),
      top23SOrHigherRate: ratio(top23.filter((row) => row.grade?.startsWith('S')).length, top23.length),
    },
    characters: {
      scores: scoreSummary(characterScores),
      distribution: gradeDistribution(audit.characterRows),
      fallbackRate: ratio(audit.characterRows.filter((row) => row.fallbackUsed).length, audit.characterRows.length),
      uncomputedRate: ratio(audit.characterRows.filter((row) => row.score == null).length, audit.characterRows.length),
      sourceCauses: sourceCauseBreakdown(audit.characterRows),
    },
    overall: {
      scores: scoreSummary(overallScores),
      distribution: gradeDistribution(audit.overallRows),
    },
  }
}

function groupAverage<T extends { score: number | null }>(
  rows: T[],
  keyOf: (row: T) => string,
) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, group]) => {
        const scores = group.flatMap((row) => row.score == null ? [] : [row.score])
        return [key, {
          count: group.length,
          scoreMean: mean(scores),
          distribution: gradeDistribution(group as Array<T & { grade: CharacterFineGrade | null }>),
        }]
      }),
  )
}

function compareAgainstFixed(audits: Record<Source, SourceAudit>) {
  const matchKey = (row: Pick<MatchGradeAuditRow, 'uid' | 'matchId'>) => `${row.uid}:${row.matchId}`
  const fixedByMatch = new Map(audits['fixed-v1'].matchRows.map((row) => [matchKey(row), row]))
  const fixedByCharacter = new Map(
    audits['fixed-v1'].characterRows.map((row) => [`${row.uid}:${row.characterNum}`, row]),
  )

  const compareSource = (source: Source) => {
    const matchDeltas = audits[source].matchRows.flatMap((row) => {
      const fixed = fixedByMatch.get(matchKey(row))
      return fixed?.score != null && row.score != null
        ? [{
            matchId: row.matchId,
            characterNum: row.characterNum,
            characterName: row.characterName,
            role: row.role,
            fixedScore: fixed.score,
            sourceScore: row.score,
            delta: round(row.score - fixed.score) ?? 0,
            fixedGrade: fixed.grade,
            sourceGrade: row.grade,
            gradeStepDelta:
              gradeStep(row.grade) != null && gradeStep(fixed.grade) != null
                ? (gradeStep(row.grade) ?? 0) - (gradeStep(fixed.grade) ?? 0)
                : null,
            coarseChanged: coarseGrade(row.grade) !== coarseGrade(fixed.grade),
          }]
        : []
    })
    const characterDeltas = audits[source].characterRows.flatMap((row) => {
      const fixed = fixedByCharacter.get(`${row.uid}:${row.characterNum}`)
      return fixed?.score != null && row.score != null
        ? [{
            uid: row.uid,
            characterNum: row.characterNum,
            characterName: row.characterName,
            fixedScore: fixed.score,
            sourceScore: row.score,
            delta: round(row.score - fixed.score) ?? 0,
            fixedGrade: fixed.grade,
            sourceGrade: row.grade,
          }]
        : []
    })
    return {
      source,
      matchScoreDelta: scoreSummary(matchDeltas.map((row) => row.delta)),
      characterScoreDelta: scoreSummary(characterDeltas.map((row) => row.delta)),
      fineGradeChangedRate: ratio(matchDeltas.filter((row) => row.gradeStepDelta !== 0).length, matchDeltas.length),
      coarseGradeChangedRate: ratio(matchDeltas.filter((row) => row.coarseChanged).length, matchDeltas.length),
      maxRisers: [...matchDeltas].sort((a, b) => b.delta - a.delta).slice(0, 10),
      maxFallers: [...matchDeltas].sort((a, b) => a.delta - b.delta).slice(0, 10),
    }
  }

  return {
    'experimental-local': compareSource('experimental-local'),
    legacy: compareSource('legacy'),
  }
}

function calibrationChecks(audit: SourceAudit) {
  const rows = audit.matchRows.filter((row) => row.grade != null && row.score != null)
  const first = rows.filter((row) => row.placement === 1)
  const top23 = rows.filter((row) => row.placement === 2 || row.placement === 3)
  const thresholdAboveSButGateMiss = rows.filter(
    (row) =>
      (row.score ?? 0) >= 84 &&
      (row.roleScore == null || row.roleScore < MATCH_GRADE_S_ROLE_SCORE_GATE) &&
      !row.grade?.startsWith('S'),
  )
  const thresholdAboveSPlusButGateMiss = rows.filter(
    (row) =>
      (row.score ?? 0) >= 95 &&
      (row.roleScore == null ||
        row.roleScore < MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE ||
        row.outcomeScore == null ||
        row.outcomeScore < MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE) &&
      row.grade !== 'S+',
  )
  return {
    firstPlaceTotal: first.length,
    firstPlaceBelowSCount: first.filter((row) => !row.grade?.startsWith('S')).length,
    firstPlaceAFamilyCount: first.filter((row) => row.grade?.startsWith('A')).length,
    firstPlaceBPlusToAMinusCount: first.filter((row) => row.grade === 'B+' || row.grade === 'A-').length,
    excellentFirstSOrSPlusCount: first.filter(
      (row) =>
        row.grade != null &&
        (row.grade === 'S+' || row.grade === 'S') &&
        (row.roleScore ?? 0) >= MATCH_GRADE_S_ROLE_SCORE_GATE,
    ).length,
    excellentTop23SCount: top23.filter(
      (row) => row.grade?.startsWith('S') && (row.roleScore ?? 0) >= MATCH_GRADE_S_ROLE_SCORE_GATE,
    ).length,
    sPlusRate: ratio(rows.filter((row) => row.grade === 'S+').length, rows.length),
    thresholdAboveSButRoleGateMissCount: thresholdAboveSButGateMiss.length,
    thresholdAboveSPlusButEliteGateMissCount: thresholdAboveSPlusButGateMiss.length,
    gateConstants: {
      sRoleScoreGate: MATCH_GRADE_S_ROLE_SCORE_GATE,
      sPlusRoleScoreGate: MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
      sPlusOutcomeScoreGate: MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
    },
  }
}

function biasReport(audit: SourceAudit) {
  const tier = groupAverage(audit.matchRows, (row) => row.tierKey ?? 'ungraded')
  const role = groupAverage(audit.matchRows, (row) => row.role ?? 'unknown-role')
  const combination = groupAverage(
    audit.matchRows.filter((row) => row.weaponTypeId != null),
    (row) => `${row.characterNum}:${row.weaponTypeId}:${row.characterName}:${row.role ?? 'unknown'}`,
  )
  const abnormalCombinations = Object.entries(combination)
    .filter(([, value]) => value.count >= 20)
    .flatMap(([key, value]) => {
      const sRate = value.distribution.sFamilyRate
      if (sRate === 0 || (value.scoreMean ?? 0) >= 82 || (value.scoreMean ?? 100) <= 45) {
        return [{ key, ...value }]
      }
      return []
    })
    .slice(0, 40)
  return { tier, role, abnormalCombinations }
}

function userComparison(
  nickname: string,
  uid: string | null,
  audits: Record<Source, SourceAudit>,
  snapshots: Array<Record<string, unknown>>,
) {
  if (!uid) return { nickname, uid: null, found: false }
  const bySource = Object.fromEntries(
    SOURCES.map((source) => {
      const sourceAudit = audits[source]
      const overall = sourceAudit.overallRows.find((row) => row.uid === uid) ?? null
      const characters = sourceAudit.characterRows
        .filter((row) => row.uid === uid)
        .sort((a, b) => b.games - a.games)
        .slice(0, 15)
      const matches = sourceAudit.matchRows
        .filter((row) => row.uid === uid)
        .slice(0, 15)
      return [source, { overall, characters, recentMatches: matches }]
    }),
  )
  return {
    nickname,
    uid,
    found: true,
    snapshotRows: snapshots.filter((row) => row.uid === uid),
    bySource,
  }
}

function yeonseoBConcentration(user: ReturnType<typeof userComparison>) {
  if (!('bySource' in user)) return null
  const fixed = user.bySource['fixed-v1'] as {
    characters: CharacterGradeAuditRow[]
    overall: OverallAuditRow | null
  }
  const rows = fixed.characters.filter((row) => row.score != null)
  const preScores = rows.flatMap((row) => row.preConfidenceScore == null ? [] : [row.preConfidenceScore])
  const postScores = rows.flatMap((row) => row.score == null ? [] : [row.score])
  const changed = rows.filter((row) => row.preConfidenceScore != null && row.score != null)
  const bOrHigher = rows.filter((row) => {
    const step = gradeStep(row.grade)
    return step != null && step >= (gradeStep('B') ?? 0)
  })
  const bMinusOrHigher = rows.filter((row) => {
    const step = gradeStep(row.grade)
    return step != null && step >= (gradeStep('B-') ?? 0)
  })
  const top5Games = rows.slice(0, 5).reduce((sum, row) => sum + row.games, 0)
  const totalGames = rows.reduce((sum, row) => sum + row.games, 0)
  return {
    gradedCharacterCount: rows.length,
    preConfidenceMean: mean(preScores),
    postConfidenceMean: mean(postScores),
    confidenceRaisedCount: changed.filter((row) => (row.score ?? 0) > (row.preConfidenceScore ?? 0)).length,
    confidenceLoweredCount: changed.filter((row) => (row.score ?? 0) < (row.preConfidenceScore ?? 0)).length,
    bOrHigherRate: ratio(bOrHigher.length, rows.length),
    bMinusOrHigherRate: ratio(bMinusOrHigher.length, rows.length),
    normalization: Object.fromEntries(
      ['none', 'elite-anchor', 'alternate-elite-anchor', 'tier-only'].map((key) => [
        key,
        rows.filter((row) => row.normalizationSource === key).length,
      ]),
    ),
    combat: Object.fromEntries(
      [...new Set(rows.map((row) => row.combatMetricSource ?? 'unknown'))].sort().map((key) => [
        key,
        rows.filter((row) => (row.combatMetricSource ?? 'unknown') === key).length,
      ]),
    ),
    top5CharacterMatchShare: ratio(top5Games, totalGames),
    overall: fixed.overall,
    interpretation:
      'fixed-v1 uses fixed tier baselines with legacy role/combat in production; concentration should be read as confidence pull toward 65 plus tier-only normalization, not as a new calibration change.',
  }
}

async function loadRows(prisma: PrismaClient): Promise<PlayerMatchAuditRow[]> {
  return prisma.playerMatch.findMany({
    where: {
      apiSeasonId: API_SEASON_ID,
      displaySeasonId: DISPLAY_SEASON_ID,
      gameMode: 'rank',
    },
    orderBy: [{ playedAt: 'desc' }, { gameId: 'desc' }],
  }) as never
}

async function loadCobaltCount(prisma: PrismaClient): Promise<number> {
  return prisma.playerMatch.count({
    where: {
      apiSeasonId: API_SEASON_ID,
      displaySeasonId: DISPLAY_SEASON_ID,
      gameMode: 'cobalt',
    },
  })
}

function buildTierMaps(rows: PlayerMatchAuditRow[]) {
  const latestByUid = new Map<string, PlayerMatchAuditRow>()
  for (const row of rows) {
    const current = latestByUid.get(row.uid)
    if (!current || row.playedAt > current.playedAt) {
      latestByUid.set(row.uid, row)
    }
  }
  const tierByUid = new Map<string, RankTier>()
  const userNumByUid = new Map<string, number>()
  for (const [uid, row] of latestByUid) {
    tierByUid.set(uid, normalizeRankTier({ rp: row.rpAfter ?? 0, displaySeason: DISPLAY_SEASON_ID }))
    const numeric = Number.parseInt(uid.replace(/\D/g, '').slice(0, 10), 10)
    userNumByUid.set(uid, Number.isFinite(numeric) ? numeric : 0)
  }
  return { tierByUid, userNumByUid }
}

async function loadTargetUids(prisma: PrismaClient) {
  const out = new Map<string, string | null>()
  for (const nickname of TARGET_NICKNAMES) {
    const row = await prisma.profileNicknameBinding.findUnique({
      where: { normalizedNickname: nickname.toLowerCase() },
    })
    out.set(nickname, row?.canonicalUid ?? null)
  }
  return out
}

async function loadSnapshotRows(prisma: PrismaClient) {
  const rows = await prisma.characterGradeSnapshot.findMany({
    select: {
      id: true,
      uid: true,
      canonicalUserNum: true,
      apiSeasonId: true,
      displaySeasonId: true,
      matchMode: true,
      benchmarkVersion: true,
      metricPresetVersion: true,
      sourceFingerprint: true,
      status: true,
      computedAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map((row) => ({
    ...row,
    canonicalUserNum: row.canonicalUserNum.toString(),
    computedAt: row.computedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

async function snapshotValidation(prisma: PrismaClient, targetUids: Map<string, string | null>) {
  const before = await loadSnapshotRows(prisma)
  const probes = []
  for (const [nickname, uid] of targetUids) {
    if (!uid) continue
    const userNum = Number((await prisma.profileNicknameBinding.findUnique({
      where: { normalizedNickname: nickname.toLowerCase() },
    }))?.canonicalUserNum ?? 0)
    const fingerprint = await computeCharacterGradeSourceFingerprint(prisma, {
      uid,
      apiSeasonId: API_SEASON_ID,
      matchMode: CHARACTER_GRADE_MATCH_MODE,
    })
    const snapshot = await readCharacterGradeSnapshot(prisma, {
      canonicalUserNum: userNum,
      apiSeasonId: API_SEASON_ID,
      matchMode: CHARACTER_GRADE_MATCH_MODE,
    })
    probes.push({
      nickname,
      uid,
      userNum,
      fingerprint,
      snapshot: snapshot
        ? {
            id: snapshot.id,
            benchmarkVersion: snapshot.benchmarkVersion,
            metricPresetVersion: snapshot.metricPresetVersion,
            status: snapshot.status,
            sourceFingerprint: snapshot.sourceFingerprint,
            computedAt: snapshot.computedAt,
          }
        : null,
    })
  }
  const cobaltSnapshotCount = await prisma.characterGradeSnapshot.count({
    where: { matchMode: 'cobalt' },
  })
  const after = await loadSnapshotRows(prisma)
  return {
    beforeCount: before.length,
    afterCount: after.length,
    unchangedByReadOnlyProbe: before.length === after.length,
    cobaltSnapshotCount,
    probes,
  }
}

async function apiVerification() {
  const status = await fetch('http://127.0.0.1:3001/api/benchmark/status').then((res) => res.json()).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }))
  const cobalt = await fetch('http://127.0.0.1:3001/api/players/%EC%97%B0%EC%84%9C/matches?page=1&pageSize=5&mode=cobalt')
    .then((res) => res.json())
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }))
  const rank = await fetch('http://127.0.0.1:3001/api/players/%EC%97%B0%EC%84%9C/matches?page=1&pageSize=5&mode=rank')
    .then((res) => res.json())
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }))
  const cobaltItems = Array.isArray(cobalt?.data?.items) ? cobalt.data.items : []
  const rankItems = Array.isArray(rank?.data?.items) ? rank.data.items : []
  return {
    status,
    cobalt: {
      itemCount: cobaltItems.length,
      gradeFieldCount: cobaltItems.filter((row: Record<string, unknown>) =>
        'matchGrade' in row || 'matchGradeScore' in row || 'gradeLabel' in row,
      ).length,
    },
    rank: {
      itemCount: rankItems.length,
      gradeCount: rankItems.filter((row: Record<string, unknown>) => row.matchGrade != null).length,
    },
  }
}

function buildText(report: Record<string, unknown>): string {
  const sourceSummaries = report.sourceSummaries as Record<string, ReturnType<typeof sourceSummary>>
  const comparisons = report.comparisons as ReturnType<typeof compareAgainstFixed>
  const calibration = report.calibration as ReturnType<typeof calibrationChecks>
  const yeonseo = report.yeonseoBConcentration as ReturnType<typeof yeonseoBConcentration>
  const lines = [
    '# 39.11R Fixed Benchmark Regression Validation',
    '',
    `generatedAt: ${report.generatedAt}`,
    `corpus: rankMatches=${(report.corpus as { rankMatchCount: number }).rankMatchCount}, cobaltMatches=${(report.corpus as { cobaltMatchCount: number }).cobaltMatchCount}`,
    `benchmarkVersion: ${CHARACTER_GRADE_BENCHMARK_VERSION}`,
    `metricPresetVersion: ${CHARACTER_GRADE_METRIC_PRESET_VERSION}`,
    '',
    '## Source summary',
  ]
  for (const source of SOURCES) {
    const summary = sourceSummaries[source]
    lines.push(
      `- ${source}: matchMean=${summary.matches.scores.mean}, matchMedian=${summary.matches.scores.median}, S+=${summary.matches.distribution.sPlusRate}, S계열=${summary.matches.distribution.sFamilyRate}, A계열=${summary.matches.distribution.aFamilyRate}, B계열=${summary.matches.distribution.bFamilyRate}, C이하=${summary.matches.distribution.cOrLowerRate}, fallback=${summary.matches.fallbackRate}`,
      `  characterMean=${summary.characters.scores.mean}, characterUngraded=${summary.characters.uncomputedRate}, overallMean=${summary.overall.scores.mean}`,
      `  causes: matchBaseline=${JSON.stringify(summary.matches.sourceCauses.baselineLevel)}, matchCombat=${JSON.stringify(summary.matches.sourceCauses.combatMetricSource)}, characterRole=${JSON.stringify(summary.characters.sourceCauses.roleMetricSource)}, characterCompleteness=${JSON.stringify(summary.characters.sourceCauses.completeness)}`,
    )
  }
  lines.push('', '## Fixed vs other sources')
  for (const source of ['experimental-local', 'legacy'] as const) {
    const comparison = comparisons[source]
    lines.push(
      `- ${source}: matchDeltaMean=${comparison.matchScoreDelta.mean}, p10=${comparison.matchScoreDelta.p10}, p90=${comparison.matchScoreDelta.p90}, fineChanged=${comparison.fineGradeChangedRate}, coarseChanged=${comparison.coarseGradeChangedRate}`,
      `  maxFall=${comparison.maxFallers[0]?.delta ?? null} (${comparison.maxFallers[0]?.characterName ?? '-'}) / maxRise=${comparison.maxRisers[0]?.delta ?? null} (${comparison.maxRisers[0]?.characterName ?? '-'})`,
    )
  }
  lines.push('', '## 39.11N calibration checks')
  lines.push(
    `- firstPlaceBelowS=${calibration.firstPlaceBelowSCount}/${calibration.firstPlaceTotal}`,
    `- firstPlaceAFamily=${calibration.firstPlaceAFamilyCount}`,
    `- firstPlaceBPlusToAMinus=${calibration.firstPlaceBPlusToAMinusCount}`,
    `- excellentFirstSOrSPlus=${calibration.excellentFirstSOrSPlusCount}`,
    `- excellentTop23S=${calibration.excellentTop23SCount}`,
    `- S+ rate=${calibration.sPlusRate}`,
    `- S gate miss fixtures=${calibration.thresholdAboveSButRoleGateMissCount}, S+ elite gate miss fixtures=${calibration.thresholdAboveSPlusButEliteGateMissCount}`,
  )
  lines.push('', '## Yeonseo B concentration')
  lines.push(
    yeonseo
      ? `- graded=${yeonseo.gradedCharacterCount}, preMean=${yeonseo.preConfidenceMean}, postMean=${yeonseo.postConfidenceMean}, raised=${yeonseo.confidenceRaisedCount}, lowered=${yeonseo.confidenceLoweredCount}, B>=${yeonseo.bOrHigherRate}, B->=${yeonseo.bMinusOrHigherRate}, top5Share=${yeonseo.top5CharacterMatchShare}`
      : '- not available',
  )
  lines.push('', '## Snapshot/API verification')
  lines.push(JSON.stringify(report.snapshotValidation, null, 2))
  lines.push('', '## Browser verification')
  lines.push('In-app browser connection failed earlier with node_repl sandbox-state metadata error; this report uses API responses, React DOM tests, and snapshot DB validation as replacement evidence.')
  lines.push('', '## Full JSON')
  lines.push('See fixed-benchmark-regression.json')
  return `${lines.join('\n')}\n`
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const rows = await loadRows(prisma)
    const cobaltMatchCount = await loadCobaltCount(prisma)
    const { tierByUid, userNumByUid } = buildTierMaps(rows)
    const targetUids = await loadTargetUids(prisma)
    const audits = Object.fromEntries(
      SOURCES.map((source) => [source, analyzeSource(source, rows, tierByUid, userNumByUid)]),
    ) as Record<Source, SourceAudit>
    const sourceSummaries = Object.fromEntries(
      SOURCES.map((source) => [source, sourceSummary(audits[source])]),
    )
    const fixedAudit = audits['fixed-v1']
    const snapshots = await loadSnapshotRows(prisma)
    const userComparisons = Object.fromEntries(
      [...targetUids.entries()].map(([nickname, uid]) => [
        nickname,
        userComparison(nickname, uid, audits, snapshots),
      ]),
    )
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      corpus: {
        apiSeasonId: API_SEASON_ID,
        displaySeasonId: DISPLAY_SEASON_ID,
        rankMatchCount: rows.length,
        cobaltMatchCount,
        playerCount: new Set(rows.map((row) => row.uid)).size,
      },
      protectedConstants: {
        benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
        metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
        outcomeWeight: 0.45,
        roleWeight: 0.55,
        fineGradeCuts: FINE_GRADE_CUTS,
        sRoleScoreGate: MATCH_GRADE_S_ROLE_SCORE_GATE,
        sPlusRoleScoreGate: MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
        sPlusOutcomeScoreGate: MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
      },
      benchmarkStatus: getCharacterGradeBenchmarkStatus(),
      sourceSummaries,
      comparisons: compareAgainstFixed(audits),
      bias: biasReport(fixedAudit),
      calibration: calibrationChecks(fixedAudit),
      userComparisons,
      yeonseoBConcentration: yeonseoBConcentration(userComparisons['연서'] as never),
      snapshotValidation: await snapshotValidation(prisma, targetUids),
      apiVerification: await apiVerification(),
      notes: [
        'Production fixed-v1 uses fixed tier baseline and source-disabled legacy role/combat fallback.',
        'experimental-local is evaluated only inside this audit by scoped process.env injection.',
        'No benchmark artifact, threshold, role preset, DB rows, or snapshot rows were modified by this script.',
      ],
    }
    await mkdir(REPORT_DIR, { recursive: true })
    await writeFile(resolve(REPORT_DIR, 'fixed-benchmark-regression.json'), JSON.stringify(report, null, 2), 'utf8')
    await writeFile(resolve(REPORT_DIR, 'fixed-benchmark-regression.txt'), buildText(report), 'utf8')
    console.log(JSON.stringify({
      reportDir: REPORT_DIR,
      rankMatchCount: rows.length,
      cobaltMatchCount,
      fixedMean: sourceSummaries['fixed-v1'].matches.scores.mean,
      experimentalDeltaMean: report.comparisons['experimental-local'].matchScoreDelta.mean,
      legacyDeltaMean: report.comparisons.legacy.matchScoreDelta.mean,
    }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

await main()
