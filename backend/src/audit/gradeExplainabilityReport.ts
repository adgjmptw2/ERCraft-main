import type { Prisma, PrismaClient } from '@prisma/client'

import weaponTypeKoDoc from '../data/weaponTypeIdToKo.generated.json' with { type: 'json' }
import type {
  GradeMetricExplanation,
  GradeScoreSectionExplanation,
} from './gradeExplanationTypes.js'
import { buildWeaponGroupGradeExplanation } from './gradeExplanation.js'
import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
  FINE_GRADE_CUTS,
  MIN_GRADE_SAMPLE_GAMES,
  OUTCOME_SCORE_WEIGHT,
  ROLE_SCORE_WEIGHT,
  applySampleConfidence,
  sampleConfidenceFactor,
  resolveGradeConfidence,
  scoreToFineGrade,
  type CharacterFineGrade,
  type GradeBaselineTierKey,
} from '../services/characterPerformanceGrade/config.js'
import {
  CHARACTER_GRADE_MATCH_MODE,
  characterGradeSnapshotId,
  computeCharacterGradeSourceFingerprint,
  readCharacterGradeSnapshot,
} from '../cache/characterGradeSnapshot.js'
import { buildCurrentSeasonCharacterStatsFromVerifiedSources } from '../cache/currentSeasonCharacterStats.js'
import { isPrismaCacheModelReady } from '../cache/prismaCacheReady.js'
import { readSeasonStatsCacheSnapshot, seasonStatsCacheId } from '../cache/seasonStatsCache.js'
import { readPersistedProfileAliasUids } from '../cache/profileIdentityAlias.js'
import { uidToUserNum } from '../external/bserMapper.js'
import { normalizeRankTier } from '../utils/rankTier.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import {
  aggregateWeaponGroupStats,
  type MatchGradeInput,
} from '../services/characterPerformanceGrade/metrics.js'
import {
  lookupBaselineForCombination,
  lookupCharacterWeaponRole,
} from '../services/characterPerformanceGrade/baselineStore.js'
import { playerMatchRowToGradeInput } from '../services/characterPerformanceGrade/compute.js'
import type { PlayerMatchRow } from '../utils/playerMatchDedup.js'
import type {
  GradeFallbackMetadataContract,
  SeasonCharacterAggregateContract,
} from '../contracts/player.js'

type SnapshotRow = Prisma.CharacterGradeSnapshotGetPayload<object>

export interface GradeExplainabilityReportOptions {
  nickname?: string
  userNum?: number
  season: number
  mode?: string
  includeUngraded?: boolean
  includeMatchSamples?: boolean
  matchSampleCount?: number
  generatedAt?: string
}

export interface GradeExplainabilityBuildResult {
  report: GradeExplainabilityReport
  text: string
}

export interface DistributionSummaryBuildResult {
  report: GradeDistributionSummary
  text: string
}

export interface GradeExplainabilityReport {
  schemaVersion: 1
  generatedAt: string
  player: {
    requestedNickname: string | null
    resolvedNickname: string | null
    canonicalUserNum: number
    canonicalUid: string
    identitySource: string
    verifiedSourceUids: string[]
  }
  scope: {
    seasonId: number
    apiSeasonId: number
    matchMode: string
    currentTier: string | null
    tierKey: string
    totalRankMatches: number
    aggregateMatchCount: number
    gradedMatchCount: number
  }
  versions: {
    benchmarkVersion: string
    metricPresetVersion: string
    gradeCalibrationVersion: string
    roleArtifactVersion: string
    combatArtifactVersion: string
    snapshotVersion: string
  }
  snapshot: {
    status: string
    fingerprint: string | null
    computedAt: string | null
    sourceUpdatedAt: string | null
    rowCount: number
    gradedRowCount: number
    stale: boolean
  }
  overallGrade: OverallGradeReport
  characterGrades: CharacterGradeExplainabilityRow[]
  ungradedCharacters: UngradedCharacterReport[]
  matchGradeSamples: MatchGradeSampleReport[]
  distributionDiagnostics: PlayerDistributionDiagnostics
  warnings: string[]
}

export interface OverallGradeReport {
  score: number | null
  grade: CharacterFineGrade | null
  source: 'character-grade-weighted-average'
  gradedCharacterCount: number
  totalCharacterCount: number
  weightedMatchCount: number
  totalRankMatchCount: number
  excludedMatchCount: number
  weightedScoreSum: number
  formula: string
  characterContributions: CharacterContributionReport[]
}

export interface CharacterContributionReport {
  characterNum: number
  characterName: string
  weaponTypeId: number | null
  weaponType: string | null
  rolePreset: string | null
  matchCount: number
  gradeScore: number | null
  grade: CharacterFineGrade | null
  weightedContribution: number
  shareOfDenominator: number | null
  shareOfWeightedScore: number | null
  included: boolean
  excludedReason: string | null
}

export interface CharacterGradeExplainabilityRow {
  characterNum: number
  characterName: string
  weaponTypeId: number | null
  weaponType: string | null
  combinationKey: string | null
  rolePreset: string | null
  roleSource: string
  roleConfidence: string | null
  matchCount: number
  wins: number
  top2: number | null
  top3: number
  averageRank: number | null
  grade: CharacterFineGrade
  gradeScore: number
  preConfidenceScore: number | null
  postConfidenceScore: number
  sampleConfidence: number | null
  sampleConfidenceFormula: string
  fineGradeThreshold: GradeThresholdReport
  benchmark: BenchmarkReport
  outcome: SectionReport
  role: SectionReport
  weaponGroups: WeaponGroupReport[]
  overallContribution: CharacterContributionReport
  fallback: GradeFallbackMetadataContract | null
}

export interface UngradedCharacterReport {
  characterNum: number
  characterName: string
  weaponTypeId: number | null
  weaponType: string | null
  rolePreset: string | null
  matchCount: number
  calculationAttempted: boolean
  gradeStatus: string | null
  missingMetrics: string[]
  completenessFailures: string[]
  baselineUnavailable: boolean
  belowMinimumSample: boolean
  minimumRequiredMatches: number
  unsupportedCombination: boolean
  snapshotMissing: boolean
  identityScopeMismatch: boolean
  otherReasons: string[]
  denominatorIncluded: false
}

export interface SectionReport {
  weight: number
  weightPercent: number
  score: number | null
  contributionToFinalScore: number | null
  configuredWeightTotal: number
  enabledWeightTotal: number
  effectiveWeightTotal: number
  presetId: string
  metrics: MetricReport[]
}

export interface MetricReport {
  metric: string
  rawValue: number | null
  baseline: number | null
  normalizedScore: number | null
  metricWeight: number
  metricWeightPercent: number
  weightedContribution: number | null
  finalScoreContribution: number | null
  direction: 'higher-is-better' | 'lower-is-better' | 'unknown'
  required: boolean
  missing: boolean
  fallback: boolean
  fallbackReason: string | null
  baselineTier: string | null
  baselineSource: string | null
  sampleCount: number | null
  coverage: number | null
  readiness: string | null
  capClamp: string
}

export interface GradeThresholdReport {
  currentGrade: CharacterFineGrade
  currentMin: number
  previousBoundary: number | null
  nextGrade: CharacterFineGrade | null
  nextMin: number | null
  pointsAboveCurrentMin: number | null
  pointsToNextGrade: number | null
}

export interface BenchmarkReport {
  requestedTierKey: string
  selectedBaselineTierKey: string | null
  exactCombinationKey: string | null
  baselineSource: string | null
  baselineFallbackLevel: 'exact' | 'tier-neighbor' | 'insufficient-baseline' | 'none'
  normalizationAnchor: string
  usedEliteAnchor: boolean
  artifactVersion: string
  sampleCount: number | null
  blocklistApplied: boolean
  legacyCombatUsed: boolean
  fallbackReasons: string[]
}

export interface WeaponGroupReport {
  weaponTypeId: number
  weaponType: string
  rolePreset: string | null
  matchCount: number
  grade: CharacterFineGrade | null
  gradeScore: number | null
  rawScoreBeforeConfidence: number | null
  confidenceFactor: number | null
  outcomeScore: number | null
  roleScore: number | null
  modes: {
    roleMetricMode: string
    combatMetricMode: string
  }
}

export interface MatchGradeSampleReport {
  gameId: string
  characterNum: number
  characterName: string
  weaponTypeId: number | null
  placement: number | null
  kills: number | null
  assists: number | null
  deaths: number | null
  teamKills: number | null
  playedAt: string
}

export interface PlayerDistributionDiagnostics {
  baselineCenter: {
    normalizeCenterScore: number
    bThreshold: number
    gradeAtCenter: CharacterFineGrade
    interpretation: string
  }
  gradeDistribution: Record<string, number>
  bOrAboveRatio: number
  confidence: {
    rowsRaised: number
    rowsLowered: number
    rowsUnchanged: number
    averageBefore: number | null
    averageAfter: number | null
    averageDelta: number | null
  }
  excludedRows: {
    totalRows: number
    gradedRows: number
    ungradedRows: number
    excludedMatchCount: number
    totalMatchCount: number
    excludedMatchRatio: number
  }
  fallback: {
    byBaselineLevel: Record<string, FallbackBucket>
    byNormalization: Record<string, FallbackBucket>
    byCombat: Record<string, FallbackBucket>
  }
  mainCharacterWeight: {
    top1DenominatorShare: number | null
    top3DenominatorShare: number | null
    top5DenominatorShare: number | null
  }
  conclusion: string[]
}

export interface FallbackBucket {
  count: number
  matchCount: number
  averageScore: number | null
  gradeDistribution: Record<string, number>
}

export interface GradeDistributionSummary {
  schemaVersion: 1
  generatedAt: string
  scope: {
    snapshotCount: number
    characterRowCount: number
    gradedRowCount: number
    ungradedRowCount: number
  }
  gradeDistribution: Record<string, number>
  matchWeightedGradeDistribution: Record<string, number>
  tierAverageScores: Record<string, AverageBucket>
  roleAverageScores: Record<string, AverageBucket>
  characterAverageScores: Record<string, AverageBucket>
  weaponAverageScores: Record<string, AverageBucket>
  fallbackLevelAverageScores: Record<string, AverageBucket>
  confidenceDelta: {
    averageBefore: number | null
    averageAfter: number | null
    averageDelta: number | null
  }
  ratios: {
    bOrAbove: number
    aOrAbove: number
    sOrAbove: number
    ungraded: number
  }
  warnings: string[]
}

export interface AverageBucket {
  count: number
  matchCount: number
  averageScore: number | null
}

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

const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z'

const weaponTypeIdToKo = (weaponTypeKoDoc as { weaponTypeIdToKo?: Record<string, string> })
  .weaponTypeIdToKo ?? {}

function round(value: number | null | undefined, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function roundNumber(value: number, digits = 2): number {
  return round(value, digits) ?? value
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return roundNumber(numerator / denominator, 4)
}

function gradeRank(grade: string | null | undefined): number {
  if (!grade) return -1
  return GRADE_ORDER.indexOf(grade as CharacterFineGrade)
}

function isGradeOrAbove(grade: string | null | undefined, min: CharacterFineGrade): boolean {
  return gradeRank(grade) >= gradeRank(min)
}

function addToCount(record: Record<string, number>, key: string, by = 1): void {
  record[key] = (record[key] ?? 0) + by
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function displayWeapon(weaponTypeId: number | null | undefined): string | null {
  if (weaponTypeId == null || weaponTypeId <= 0) return null
  return weaponTypeIdToKo[String(weaponTypeId)] ?? `weapon:${weaponTypeId}`
}

function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase()
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseStatsNickname(data: unknown): string | null {
  if (!Array.isArray(data)) return null
  for (const row of data) {
    const record = jsonObject(row)
    const nickname = record?.nickname
    if (typeof nickname === 'string' && nickname.trim()) return nickname.trim()
  }
  return null
}

function parseSquadStats(data: unknown): { mmr: number; nickname: string | null; ranking?: number | null } | null {
  if (!Array.isArray(data)) return null
  const rows = data.flatMap((row) => {
    const record = jsonObject(row)
    if (!record) return []
    const mmr = record.mmr
    if (typeof mmr !== 'number') return []
    return [{
      mmr,
      nickname: typeof record.nickname === 'string' ? record.nickname : null,
      matchingTeamMode: typeof record.matchingTeamMode === 'number' ? record.matchingTeamMode : null,
      ranking: typeof record.ranking === 'number' ? record.ranking : null,
      rank: typeof record.rank === 'number' ? record.rank : null,
    }]
  })
  const squad = rows.find((row) => row.matchingTeamMode === 3) ?? rows[0] ?? null
  if (!squad) return null
  return { mmr: squad.mmr, nickname: squad.nickname, ranking: squad.ranking ?? squad.rank ?? null }
}

function snapshotMeta(snapshot: { meta?: unknown } | null): Record<string, unknown> | null {
  if (!snapshot) return null
  const metadata = jsonObject(snapshot.meta)
  const meta = jsonObject(metadata?.meta)
  return meta ?? metadata
}

function parseCharacterStats(value: unknown): SeasonCharacterAggregateContract[] {
  return Array.isArray(value) ? (value as SeasonCharacterAggregateContract[]) : []
}

async function resolveIdentity(
  prisma: PrismaClient,
  options: GradeExplainabilityReportOptions,
): Promise<{
  canonicalUid: string
  canonicalUserNum: number
  identitySource: string
  resolvedNickname: string | null
  apiSeasonId: number
  snapshotRow: SnapshotRow | null
  verifiedSourceUids: string[]
}> {
  const mode = options.mode ?? CHARACTER_GRADE_MATCH_MODE
  let snapshotRow: SnapshotRow | null = null
  let canonicalUid: string | null = null
  let identitySource = 'unknown'

  if (options.userNum != null) {
    snapshotRow = await prisma.characterGradeSnapshot.findFirst({
      where: {
        canonicalUserNum: options.userNum,
        displaySeasonId: options.season,
        matchMode: mode,
      },
      orderBy: { computedAt: 'desc' },
    })
    if (!snapshotRow) {
      throw new Error(`No character grade snapshot for userNum=${options.userNum}, season=${options.season}, mode=${mode}`)
    }
    canonicalUid = snapshotRow.uid
    identitySource = 'character-grade-snapshot:user-num'
  }

  if (!canonicalUid && options.nickname) {
    const binding = await prisma.profileNicknameBinding.findUnique({
      where: { normalizedNickname: normalizeNickname(options.nickname) },
    })
    if (binding) {
      canonicalUid = binding.canonicalUid
      identitySource = 'profile-nickname-binding'
    }
  }

  if (!canonicalUid && options.nickname && isPrismaCacheModelReady(prisma, 'seasonStatsCache')) {
    const rows = await prisma.seasonStatsCache.findMany({
      select: { id: true, data: true },
      take: 1000,
    })
    const matches = rows.filter((row) =>
      parseStatsNickname(row.data)?.toLowerCase() === normalizeNickname(options.nickname ?? ''),
    )
    const scored = await Promise.all(matches.map(async (row) => {
      const uid = row.id.slice(0, row.id.lastIndexOf(':'))
      const count = await prisma.playerMatch.count({
        where: { uid, displaySeasonId: options.season, gameMode: mode },
      })
      return { uid, count }
    }))
    const best = scored.sort((a, b) => b.count - a.count || a.uid.localeCompare(b.uid))[0]
    if (best && best.count > 0) {
      canonicalUid = best.uid
      identitySource = 'season-stats-cache:nickname'
    }
  }

  if (!canonicalUid && options.nickname) {
    const rows = await prisma.matchParticipant.findMany({
      where: { nickname: options.nickname.trim() },
      select: { uid: true },
      distinct: ['uid'],
      take: 32,
    })
    const candidates = rows.flatMap((row) => row.uid ? [row.uid] : [])
    const scored = await Promise.all(candidates.map(async (uid) => ({
      uid,
      count: await prisma.playerMatch.count({
        where: { uid, displaySeasonId: options.season, gameMode: mode },
      }),
    })))
    const best = scored.sort((a, b) => b.count - a.count || a.uid.localeCompare(b.uid))[0]
    if (best && best.count > 0) {
      canonicalUid = best.uid
      identitySource = 'match-participant:nickname'
    }
  }

  if (!canonicalUid) {
    throw new Error('Unable to resolve identity from local DB without external API. Provide --user-num or ensure nickname binding/cache exists.')
  }

  const canonicalUserNum = uidToUserNum(canonicalUid)
  if (!snapshotRow) {
    snapshotRow = await prisma.characterGradeSnapshot.findFirst({
      where: {
        uid: canonicalUid,
        canonicalUserNum,
        displaySeasonId: options.season,
        matchMode: mode,
      },
      orderBy: { computedAt: 'desc' },
    })
  }

  let apiSeasonId = snapshotRow?.apiSeasonId ?? null
  if (apiSeasonId == null) {
    const row = await prisma.playerMatch.groupBy({
      by: ['apiSeasonId'],
      where: { uid: canonicalUid, displaySeasonId: options.season, gameMode: mode },
      _count: { _all: true },
      orderBy: { _count: { apiSeasonId: 'desc' } },
      take: 1,
    })
    apiSeasonId = row[0]?.apiSeasonId ?? null
  }
  if (apiSeasonId == null) {
    throw new Error(`No local PlayerMatch rows for uid=${canonicalUid}, displaySeason=${options.season}, mode=${mode}`)
  }

  const aliasUids = await readPersistedProfileAliasUids(prisma, canonicalUid)
  const verifiedSourceUids = [...new Set([canonicalUid, ...aliasUids])]
  const stats = await readSeasonStatsCacheSnapshot(prisma, seasonStatsCacheId(canonicalUid, apiSeasonId))
  const resolvedNickname = parseStatsNickname(stats) ?? options.nickname ?? null

  return {
    canonicalUid,
    canonicalUserNum,
    identitySource,
    resolvedNickname,
    apiSeasonId,
    snapshotRow,
    verifiedSourceUids,
  }
}

function rowGradeScore(row: SeasonCharacterAggregateContract): number | null {
  return typeof row.gradeScore === 'number' && Number.isFinite(row.gradeScore) ? row.gradeScore : null
}

function rowGrade(row: SeasonCharacterAggregateContract): CharacterFineGrade | null {
  return typeof row.grade === 'string' ? row.grade as CharacterFineGrade : null
}

function characterName(row: SeasonCharacterAggregateContract): string {
  return row.characterName ?? `character:${row.characterNum}`
}

function sortCharacterRows(
  rows: SeasonCharacterAggregateContract[],
): SeasonCharacterAggregateContract[] {
  return [...rows].sort((a, b) => {
    const scoreDelta = (rowGradeScore(b) ?? -1) - (rowGradeScore(a) ?? -1)
    return (
      b.games - a.games ||
      scoreDelta ||
      a.characterNum - b.characterNum ||
      characterName(a).localeCompare(characterName(b))
    )
  })
}

function sortContributions(rows: CharacterContributionReport[]): CharacterContributionReport[] {
  return [...rows].sort((a, b) =>
    b.weightedContribution - a.weightedContribution ||
    b.matchCount - a.matchCount ||
    a.characterNum - b.characterNum ||
    (a.weaponTypeId ?? 0) - (b.weaponTypeId ?? 0),
  )
}

function matchesByCharacterAndWeapon(rows: PlayerMatchRow[]): Map<number, Map<number, MatchGradeInput[]>> {
  const map = new Map<number, Map<number, MatchGradeInput[]>>()
  for (const row of rows) {
    const input = playerMatchRowToGradeInput(row)
    if (!input || input.weaponTypeId == null) continue
    const byWeapon = map.get(row.characterNum) ?? new Map<number, MatchGradeInput[]>()
    const bucket = byWeapon.get(input.weaponTypeId) ?? []
    bucket.push(input)
    byWeapon.set(input.weaponTypeId, bucket)
    map.set(row.characterNum, byWeapon)
  }
  return map
}

function playerMatchSamples(rows: PlayerMatchRow[], count: number): MatchGradeSampleReport[] {
  return rows.slice(0, count).map((row) => ({
    gameId: row.gameId,
    characterNum: row.characterNum,
    characterName: row.characterName ?? `character:${row.characterNum}`,
    weaponTypeId: row.bestWeapon ?? null,
    placement: row.placement ?? null,
    kills: row.kills ?? null,
    assists: row.assists ?? null,
    deaths: row.deaths ?? null,
    teamKills: row.teamKills ?? null,
    playedAt: row.playedAt.toISOString(),
  }))
}

function sectionReport(section: GradeScoreSectionExplanation): SectionReport {
  const weightRatio = section.weight / 100
  return {
    weight: weightRatio,
    weightPercent: section.weight,
    score: round(section.score),
    contributionToFinalScore: section.score == null ? null : roundNumber(section.score * weightRatio),
    configuredWeightTotal: roundNumber(section.configuredWeightTotal),
    enabledWeightTotal: roundNumber(section.enabledWeightTotal),
    effectiveWeightTotal: roundNumber(section.effectiveWeightTotal),
    presetId: section.presetId,
    metrics: section.metrics.map((metric) => metricReport(metric, weightRatio)),
  }
}

function metricDirection(metric: string): MetricReport['direction'] {
  return metric === 'averagePlacement' || metric === 'deaths'
    ? 'lower-is-better'
    : metric === 'combatContribution' ||
        metric === 'finisherShare' ||
        metric === 'tankingEfficiency' ||
        metric === 'shieldDamageOffsetFromPlayer' ||
        metric === 'teamRecover' ||
        metric === 'tankingUtility' ||
        metric === 'supportUtility' ||
        metric === 'damageToPlayer' ||
        metric === 'kills' ||
        metric === 'assists' ||
        metric === 'teamKills' ||
        metric === 'winRate' ||
        metric === 'top3Rate' ||
        metric === 'viewContribution' ||
        metric === 'monsterKill'
      ? 'higher-is-better'
      : 'unknown'
}

function metricReport(metric: GradeMetricExplanation, sectionWeight: number): MetricReport {
  return {
    metric: metric.metric,
    rawValue: round(metric.userValue, 4),
    baseline: round(metric.baselineValue, 4),
    normalizedScore: round(metric.normalizedScore),
    metricWeight: roundNumber(metric.configuredWeight),
    metricWeightPercent: roundNumber(metric.effectiveWeightAfterNormalization),
    weightedContribution: round(metric.weightedContributionAfterNormalization),
    finalScoreContribution:
      metric.weightedContributionAfterNormalization == null
        ? null
        : roundNumber(metric.weightedContributionAfterNormalization * sectionWeight),
    direction: metricDirection(metric.metric),
    required: metric.configuredWeight > 0,
    missing: metric.normalizedScore == null,
    fallback: metric.usedFallback,
    fallbackReason: metric.fallbackReason,
    baselineTier: metric.baselineTier,
    baselineSource: metric.baselineSource,
    sampleCount: metric.sampleCount,
    coverage: round(metric.coverage, 4),
    readiness: metric.readiness,
    capClamp: 'robust-normalize:clamp-20-100',
  }
}

function thresholdReport(score: number, grade: CharacterFineGrade): GradeThresholdReport {
  const currentIndex = FINE_GRADE_CUTS.findIndex((cut) => cut.grade === grade)
  const current = FINE_GRADE_CUTS[currentIndex]
  const next = currentIndex > 0 ? FINE_GRADE_CUTS[currentIndex - 1] : null
  const previous = currentIndex < FINE_GRADE_CUTS.length - 1 ? FINE_GRADE_CUTS[currentIndex + 1] : null
  return {
    currentGrade: grade,
    currentMin: current.min,
    previousBoundary: Number.isFinite(previous?.min) ? previous?.min ?? null : null,
    nextGrade: next?.grade ?? null,
    nextMin: next?.min ?? null,
    pointsAboveCurrentMin: Number.isFinite(current.min) ? roundNumber(score - current.min) : null,
    pointsToNextGrade: next ? roundNumber(Math.max(0, next.min - score)) : null,
  }
}

function fallbackLevel(fallback: GradeFallbackMetadataContract | undefined | null): BenchmarkReport['baselineFallbackLevel'] {
  const level = fallback?.baselineLevel
  if (level === 'exact' || level === 'tier-neighbor' || level === 'insufficient-baseline' || level === 'none') {
    return level
  }
  return 'none'
}

function buildBenchmarkReport(params: {
  row: SeasonCharacterAggregateContract
  requestedTierKey: GradeBaselineTierKey
  primaryWeaponTypeId: number | null
  outcome: SectionReport | null
  role: SectionReport | null
}): BenchmarkReport {
  const fallback = params.row.gradeFallback
  const selectedTier = params.row.gradeBaselineTierKey ?? null
  const baseline = params.primaryWeaponTypeId == null
    ? null
    : lookupBaselineForCombination(
        params.requestedTierKey,
        params.row.characterNum,
        params.primaryWeaponTypeId,
      )
  const allMetrics = [...(params.outcome?.metrics ?? []), ...(params.role?.metrics ?? [])]
  const usedEliteAnchor = allMetrics.some((metric) => metric.fallbackReason === 'elite')
  const normalization = fallback?.normalization ?? 'none'
  return {
    requestedTierKey: params.requestedTierKey,
    selectedBaselineTierKey: selectedTier,
    exactCombinationKey: params.primaryWeaponTypeId == null
      ? null
      : `${params.requestedTierKey}:${params.row.characterNum}:${params.primaryWeaponTypeId}`,
    baselineSource: allMetrics.find((metric) => metric.baselineSource)?.baselineSource ?? null,
    baselineFallbackLevel: fallbackLevel(fallback),
    normalizationAnchor: normalization,
    usedEliteAnchor,
    artifactVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
    sampleCount: baseline?.metrics.count ?? null,
    blocklistApplied: fallback?.combat === 'blocked-exact-key',
    legacyCombatUsed: params.row.gradeCombatMetricMode === 'legacy-k-a-tk',
    fallbackReasons: fallback?.reasons ?? [],
  }
}

function buildUngradedReport(params: {
  row: SeasonCharacterAggregateContract
  byWeapon: Map<number, MatchGradeInput[]> | undefined
}): UngradedCharacterReport {
  const primary = primaryWeaponGroup(params.byWeapon)
  const role = primary ? lookupCharacterWeaponRole(params.row.characterNum, primary.weaponTypeId) : null
  const status = params.row.gradeStatus ?? null
  const missingMetrics = params.row.gradeCombatMissingMetrics ?? []
  const completenessFailures = [
    ...(params.row.gradeCombatPresetComplete === false ? ['combat-preset-incomplete'] : []),
    ...missingMetrics.map((metric) => `missing:${metric}`),
  ]
  const belowMinimumSample = status === 'insufficient-sample' || params.row.games < MIN_GRADE_SAMPLE_GAMES
  const unsupportedCombination = primary != null && role == null
  const baselineUnavailable = status === 'missing-baseline'
  return {
    characterNum: params.row.characterNum,
    characterName: characterName(params.row),
    weaponTypeId: primary?.weaponTypeId ?? null,
    weaponType: displayWeapon(primary?.weaponTypeId),
    rolePreset: role,
    matchCount: params.row.games,
    calculationAttempted: primary != null,
    gradeStatus: status,
    missingMetrics,
    completenessFailures,
    baselineUnavailable,
    belowMinimumSample,
    minimumRequiredMatches: MIN_GRADE_SAMPLE_GAMES,
    unsupportedCombination,
    snapshotMissing: false,
    identityScopeMismatch: false,
    otherReasons: [
      ...(status ? [status] : []),
      ...(primary == null ? ['no-valid-weapon-group'] : []),
    ],
    denominatorIncluded: false,
  }
}

function primaryWeaponGroup(byWeapon: Map<number, MatchGradeInput[]> | undefined): { weaponTypeId: number; matches: MatchGradeInput[] } | null {
  if (!byWeapon || byWeapon.size === 0) return null
  return [...byWeapon.entries()]
    .map(([weaponTypeId, matches]) => ({ weaponTypeId, matches }))
    .sort((a, b) => b.matches.length - a.matches.length || a.weaponTypeId - b.weaponTypeId)[0] ?? null
}

function countPlacements(byWeapon: Map<number, MatchGradeInput[]> | undefined, maxPlacement: number): number {
  if (!byWeapon) return 0
  return [...byWeapon.values()]
    .flat()
    .filter((match) => match.placement > 0 && match.placement <= maxPlacement).length
}

function buildWeaponGroupReports(params: {
  row: SeasonCharacterAggregateContract
  byWeapon: Map<number, MatchGradeInput[]> | undefined
  tierKey: GradeBaselineTierKey
  displaySeasonId: number
}): {
  groups: WeaponGroupReport[]
  explanations: Array<ReturnType<typeof buildWeaponGroupGradeExplanation>>
  primaryExplanation: ReturnType<typeof buildWeaponGroupGradeExplanation> | null
} {
  const groups: WeaponGroupReport[] = []
  const explanations: Array<ReturnType<typeof buildWeaponGroupGradeExplanation>> = []
  let primaryExplanation: ReturnType<typeof buildWeaponGroupGradeExplanation> | null = null
  const entries = [...(params.byWeapon?.entries() ?? [])].sort(
    (a, b) => b[1].length - a[1].length || a[0] - b[0],
  )
  for (const [weaponTypeId, matches] of entries) {
    const role = lookupCharacterWeaponRole(params.row.characterNum, weaponTypeId)
    const stats = aggregateWeaponGroupStats(params.row.characterNum, weaponTypeId, matches)
    if (!role || !stats) {
      groups.push({
        weaponTypeId,
        weaponType: displayWeapon(weaponTypeId) ?? `weapon:${weaponTypeId}`,
        rolePreset: role,
        matchCount: matches.length,
        grade: null,
        gradeScore: null,
        rawScoreBeforeConfidence: null,
        confidenceFactor: null,
        outcomeScore: null,
        roleScore: null,
        modes: { roleMetricMode: 'unavailable', combatMetricMode: 'unavailable' },
      })
      continue
    }
    const explanation = buildWeaponGroupGradeExplanation({
      stats,
      matches,
      role,
      playerTierKey: params.tierKey,
      displaySeasonId: params.displaySeasonId,
    })
    if (!primaryExplanation) primaryExplanation = explanation
    explanations.push(explanation)
    groups.push({
      weaponTypeId,
      weaponType: displayWeapon(weaponTypeId) ?? `weapon:${weaponTypeId}`,
      rolePreset: role,
      matchCount: matches.length,
      grade: explanation.finalGrade as CharacterFineGrade | null,
      gradeScore: explanation.finalScore,
      rawScoreBeforeConfidence: explanation.rawScoreBeforeConfidence,
      confidenceFactor: explanation.confidenceFactor,
      outcomeScore: round(explanation.outcome.score),
      roleScore: round(explanation.roleScore.score),
      modes: explanation.modes,
    })
  }
  return { groups, explanations, primaryExplanation }
}

function aggregateSectionFromExplanations(
  explanations: Array<ReturnType<typeof buildWeaponGroupGradeExplanation>>,
  sectionName: 'outcome' | 'role',
): SectionReport | null {
  const totalMatches = explanations.reduce((sum, explanation) => sum + explanation.matchCount, 0)
  if (totalMatches <= 0) return null
  const sectionWeight = sectionName === 'outcome' ? OUTCOME_SCORE_WEIGHT : ROLE_SCORE_WEIGHT
  const sectionWeightPercent = sectionWeight * 100
  let scoreSum = 0
  const metrics: MetricReport[] = []
  let configuredWeightTotal = 0
  let enabledWeightTotal = 0
  let effectiveWeightTotal = 0

  for (const explanation of explanations) {
    const share = explanation.matchCount / totalMatches
    const section = sectionName === 'outcome' ? explanation.outcome : explanation.roleScore
    const report = sectionReport(section)
    if (report.score != null) scoreSum += report.score * share
    configuredWeightTotal += report.configuredWeightTotal * share
    enabledWeightTotal += report.enabledWeightTotal * share
    effectiveWeightTotal += report.effectiveWeightTotal * share
    const weapon = displayWeapon(explanation.weaponTypeId) ?? `weapon:${explanation.weaponTypeId}`
    for (const metric of report.metrics) {
      metrics.push({
        ...metric,
        metric: `${weapon}:${metric.metric}`,
        metricWeightPercent: roundNumber(metric.metricWeightPercent * share),
        weightedContribution:
          metric.weightedContribution == null
            ? null
            : roundNumber(metric.weightedContribution * share),
        finalScoreContribution:
          metric.finalScoreContribution == null
            ? null
            : roundNumber(metric.finalScoreContribution * share),
      })
    }
  }

  const score = roundNumber(scoreSum)
  return {
    weight: sectionWeight,
    weightPercent: sectionWeightPercent,
    score,
    contributionToFinalScore: roundNumber(score * sectionWeight),
    configuredWeightTotal: roundNumber(configuredWeightTotal),
    enabledWeightTotal: roundNumber(enabledWeightTotal),
    effectiveWeightTotal: roundNumber(effectiveWeightTotal),
    presetId: explanations.length === 1
      ? sectionName === 'outcome'
        ? explanations[0].outcome.presetId
        : explanations[0].roleScore.presetId
      : `multi-weapon-${sectionName}`,
    metrics,
  }
}

function buildContribution(
  row: SeasonCharacterAggregateContract,
  weightedScoreSum: number,
  weightedMatches: number,
  primary: { weaponTypeId: number; matches: MatchGradeInput[] } | null,
): CharacterContributionReport {
  const score = rowGradeScore(row)
  const grade = rowGrade(row)
  const included = score != null && grade != null && row.gradeStatus === 'ok'
  const weightedContribution = included ? score * row.games : 0
  const role = primary ? lookupCharacterWeaponRole(row.characterNum, primary.weaponTypeId) : null
  return {
    characterNum: row.characterNum,
    characterName: characterName(row),
    weaponTypeId: primary?.weaponTypeId ?? null,
    weaponType: displayWeapon(primary?.weaponTypeId),
    rolePreset: row.gradeRole ?? role,
    matchCount: row.games,
    gradeScore: score,
    grade,
    weightedContribution: roundNumber(weightedContribution),
    shareOfDenominator: included ? ratio(row.games, weightedMatches) : null,
    shareOfWeightedScore: included ? ratio(weightedContribution, weightedScoreSum) : null,
    included,
    excludedReason: included ? null : row.gradeStatus ?? 'no-grade-score',
  }
}

function buildOverall(rows: SeasonCharacterAggregateContract[], byCharacter: Map<number, Map<number, MatchGradeInput[]>>): OverallGradeReport {
  const weightedScoreSum = rows.reduce((sum, row) => {
    const score = rowGradeScore(row)
    return score == null || row.gradeStatus !== 'ok' ? sum : sum + score * row.games
  }, 0)
  const weightedMatchCount = rows.reduce((sum, row) =>
    rowGradeScore(row) == null || row.gradeStatus !== 'ok' ? sum : sum + row.games, 0)
  const totalRankMatchCount = rows.reduce((sum, row) => sum + row.games, 0)
  const score = weightedMatchCount > 0 ? roundNumber(weightedScoreSum / weightedMatchCount) : null
  const grade = score == null ? null : scoreToFineGrade(score)
  const contributions = rows.map((row) =>
    buildContribution(
      row,
      weightedScoreSum,
      weightedMatchCount,
      primaryWeaponGroup(byCharacter.get(row.characterNum)),
    ),
  )
  return {
    score,
    grade,
    source: 'character-grade-weighted-average',
    gradedCharacterCount: rows.filter((row) => row.gradeStatus === 'ok' && rowGradeScore(row) != null).length,
    totalCharacterCount: rows.length,
    weightedMatchCount,
    totalRankMatchCount,
    excludedMatchCount: totalRankMatchCount - weightedMatchCount,
    weightedScoreSum: roundNumber(weightedScoreSum),
    formula: 'overallPerformanceScore = Σ(character.gradeScore × character.matchCount) / Σ(included character.matchCount)',
    characterContributions: sortContributions(contributions),
  }
}

function makeFallbackBucket(): FallbackBucket {
  return { count: 0, matchCount: 0, averageScore: null, gradeDistribution: {} }
}

function finalizeFallbackBuckets(raw: Map<string, { scores: number[]; bucket: FallbackBucket }>): Record<string, FallbackBucket> {
  const out: Record<string, FallbackBucket> = {}
  for (const [key, value] of [...raw.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out[key] = {
      ...value.bucket,
      averageScore: average(value.scores),
    }
  }
  return out
}

function addFallbackBucket(
  map: Map<string, { scores: number[]; bucket: FallbackBucket }>,
  key: string,
  row: SeasonCharacterAggregateContract,
): void {
  const score = rowGradeScore(row)
  const grade = rowGrade(row)
  const value = map.get(key) ?? { scores: [], bucket: makeFallbackBucket() }
  value.bucket.count += 1
  value.bucket.matchCount += row.games
  if (score != null) value.scores.push(score)
  if (grade) addToCount(value.bucket.gradeDistribution, grade)
  map.set(key, value)
}

function buildDiagnostics(params: {
  rows: SeasonCharacterAggregateContract[]
  characterGrades: CharacterGradeExplainabilityRow[]
  ungraded: UngradedCharacterReport[]
  overall: OverallGradeReport
}): PlayerDistributionDiagnostics {
  const gradeDistribution: Record<string, number> = {}
  for (const row of params.rows) {
    const grade = rowGrade(row)
    if (grade) addToCount(gradeDistribution, grade)
  }

  const before = params.characterGrades.flatMap((row) =>
    row.preConfidenceScore == null ? [] : [row.preConfidenceScore],
  )
  const after = params.characterGrades.map((row) => row.postConfidenceScore)
  let rowsRaised = 0
  let rowsLowered = 0
  let rowsUnchanged = 0
  for (const row of params.characterGrades) {
    if (row.preConfidenceScore == null) continue
    const delta = row.postConfidenceScore - row.preConfidenceScore
    if (Math.abs(delta) < 0.005) rowsUnchanged += 1
    else if (delta > 0) rowsRaised += 1
    else rowsLowered += 1
  }

  const baseline = new Map<string, { scores: number[]; bucket: FallbackBucket }>()
  const normalization = new Map<string, { scores: number[]; bucket: FallbackBucket }>()
  const combat = new Map<string, { scores: number[]; bucket: FallbackBucket }>()
  for (const row of params.rows.filter((entry) => rowGradeScore(entry) != null)) {
    addFallbackBucket(baseline, row.gradeFallback?.baselineLevel ?? 'none', row)
    addFallbackBucket(normalization, row.gradeFallback?.normalization ?? 'none', row)
    addFallbackBucket(combat, row.gradeFallback?.combat ?? 'none', row)
  }

  const topIncluded = params.overall.characterContributions.filter((entry) => entry.included)
  const topShare = (count: number) =>
    ratio(topIncluded.slice(0, count).reduce((sum, entry) => sum + entry.matchCount, 0), params.overall.weightedMatchCount)
  const totalMatchCount = params.overall.totalRankMatchCount
  const excludedMatchCount = params.overall.excludedMatchCount
  const bOrAbove = params.rows.filter((row) => isGradeOrAbove(rowGrade(row), 'B')).length
  const graded = params.rows.filter((row) => rowGrade(row)).length
  const conclusions = [
    `B threshold is ${FINE_GRADE_CUTS.find((cut) => cut.grade === 'B')?.min}; normalize center 65 maps to ${scoreToFineGrade(65)}.`,
    `${params.characterGrades.length}/${params.rows.length} rows are graded; ${excludedMatchCount}/${totalMatchCount} matches are excluded from the denominator.`,
    `Confidence changed rows: raised=${rowsRaised}, lowered=${rowsLowered}, unchanged=${rowsUnchanged}.`,
    `Top 5 included characters account for ${roundNumber((topShare(5) ?? 0) * 100)}% of weighted denominator.`,
    `${graded > 0 ? roundNumber((bOrAbove / graded) * 100) : 0}% of graded rows are B or above.`,
  ]
  return {
    baselineCenter: {
      normalizeCenterScore: 65,
      bThreshold: FINE_GRADE_CUTS.find((cut) => cut.grade === 'B')?.min ?? 62,
      gradeAtCenter: scoreToFineGrade(65),
      interpretation: 'Current normalization uses 65 as cohort-center score, and B starts at 62, so cohort-center rows naturally display as B.',
    },
    gradeDistribution,
    bOrAboveRatio: graded > 0 ? roundNumber(bOrAbove / graded, 4) : 0,
    confidence: {
      rowsRaised,
      rowsLowered,
      rowsUnchanged,
      averageBefore: average(before),
      averageAfter: average(after),
      averageDelta: before.length === after.length && before.length > 0
        ? average(after.map((value, index) => value - before[index]))
        : null,
    },
    excludedRows: {
      totalRows: params.rows.length,
      gradedRows: params.characterGrades.length,
      ungradedRows: params.ungraded.length,
      excludedMatchCount,
      totalMatchCount,
      excludedMatchRatio: roundNumber(excludedMatchCount / Math.max(totalMatchCount, 1), 4),
    },
    fallback: {
      byBaselineLevel: finalizeFallbackBuckets(baseline),
      byNormalization: finalizeFallbackBuckets(normalization),
      byCombat: finalizeFallbackBuckets(combat),
    },
    mainCharacterWeight: {
      top1DenominatorShare: topShare(1),
      top3DenominatorShare: topShare(3),
      top5DenominatorShare: topShare(5),
    },
    conclusion: conclusions,
  }
}

export async function buildGradeExplainabilityReport(
  prisma: PrismaClient,
  options: GradeExplainabilityReportOptions,
): Promise<GradeExplainabilityBuildResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const mode = options.mode ?? CHARACTER_GRADE_MATCH_MODE
  const identity = await resolveIdentity(prisma, options)
  const snapshot = identity.snapshotRow
    ? await readCharacterGradeSnapshot(prisma, {
        canonicalUserNum: identity.canonicalUserNum,
        apiSeasonId: identity.apiSeasonId,
        matchMode: mode,
      })
    : null

  const raw = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, {
    uid: identity.canonicalUid,
    playerMatchUids: identity.verifiedSourceUids,
    apiSeasonId: identity.apiSeasonId,
    displaySeasonId: options.season,
  })

  const statsCache = await readSeasonStatsCacheSnapshot(
    prisma,
    seasonStatsCacheId(identity.canonicalUid, identity.apiSeasonId),
  )
  const squad = parseSquadStats(statsCache)
  const tier = normalizeRankTier({
    rp: squad?.mmr ?? null,
    rankingPosition: squad?.ranking ?? null,
    displaySeason: options.season,
  })
  const tierKey = rankTierToGradeBaselineKey(tier)
  if (!tierKey) {
    throw new Error(`Unable to resolve grade baseline tier from local season stats for uid=${identity.canonicalUid}`)
  }

  const snapshotRows = snapshot?.characterStats ?? parseCharacterStats(identity.snapshotRow?.characterStats)
  const rows = sortCharacterRows(snapshotRows.length > 0 ? snapshotRows : raw.characterStats)
  if (rows.length === 0) {
    throw new Error(`No character stats rows available for uid=${identity.canonicalUid}, apiSeason=${identity.apiSeasonId}`)
  }

  const byCharacter = matchesByCharacterAndWeapon(raw.rows)
  const overall = buildOverall(rows, byCharacter)
  const characterGrades: CharacterGradeExplainabilityRow[] = []
  const ungraded: UngradedCharacterReport[] = []

  for (const row of rows) {
    const score = rowGradeScore(row)
    const grade = rowGrade(row)
    const byWeapon = byCharacter.get(row.characterNum)
    const primary = primaryWeaponGroup(byWeapon)
    const { groups, explanations, primaryExplanation } = buildWeaponGroupReports({
      row,
      byWeapon,
      tierKey,
      displaySeasonId: options.season,
    })
    const contribution = buildContribution(
      row,
      overall.weightedScoreSum,
      overall.weightedMatchCount,
      primary,
    )

    if (score == null || grade == null || row.gradeStatus !== 'ok' || !primaryExplanation) {
      ungraded.push(buildUngradedReport({ row, byWeapon }))
      continue
    }

    const outcome = aggregateSectionFromExplanations(explanations, 'outcome') ?? sectionReport(primaryExplanation.outcome)
    const role = aggregateSectionFromExplanations(explanations, 'role') ?? sectionReport(primaryExplanation.roleScore)
    const preConfidenceScore =
      outcome.score == null || role.score == null
        ? primaryExplanation.rawScoreBeforeConfidence
        : roundNumber(outcome.score * OUTCOME_SCORE_WEIGHT + role.score * ROLE_SCORE_WEIGHT)
    const benchmark = buildBenchmarkReport({
      row,
      requestedTierKey: tierKey,
      primaryWeaponTypeId: primary?.weaponTypeId ?? null,
      outcome,
      role,
    })
    characterGrades.push({
      characterNum: row.characterNum,
      characterName: characterName(row),
      weaponTypeId: primary?.weaponTypeId ?? null,
      weaponType: displayWeapon(primary?.weaponTypeId),
      combinationKey: primary ? `${row.characterNum}:${primary.weaponTypeId}` : null,
      rolePreset: row.gradeRole ?? primaryExplanation.role,
      roleSource: primaryExplanation.modes.roleMetricMode,
      roleConfidence: row.gradeRoleMetricBaselineReadiness ?? null,
      matchCount: row.games,
      wins: row.wins,
      top2: countPlacements(byWeapon, 2),
      top3: countPlacements(byWeapon, 3),
      averageRank: row.avgRank,
      grade,
      gradeScore: score,
      preConfidenceScore,
      postConfidenceScore: score,
      sampleConfidence: primaryExplanation.confidenceFactor,
      sampleConfidenceFormula:
        row.games >= 20
          ? 'rawScore (20+ games)'
          : `65 + (rawScore - 65) * (${row.games} / (${row.games} + 1))`,
      fineGradeThreshold: thresholdReport(score, grade),
      benchmark,
      outcome,
      role,
      weaponGroups: groups,
      overallContribution: contribution,
      fallback: row.gradeFallback ?? null,
    })
  }

  const fingerprint = snapshot
    ? await computeCharacterGradeSourceFingerprint(prisma, {
        uid: identity.canonicalUid,
        apiSeasonId: identity.apiSeasonId,
        matchMode: mode,
      })
    : null
  const meta = snapshotMeta(snapshot)
  const warnings: string[] = []
  if (!snapshot) warnings.push('character grade snapshot not found; report used current aggregate rows')
  if (fingerprint && snapshot && fingerprint.value !== snapshot.sourceFingerprint) {
    warnings.push('snapshot fingerprint differs from current PlayerMatch source fingerprint')
  }
  if (raw.deduplicatedMatchCount !== overall.totalRankMatchCount) {
    warnings.push(`aggregate match count differs from deduped PlayerMatch rows: aggregate=${overall.totalRankMatchCount}, deduped=${raw.deduplicatedMatchCount}`)
  }

  const diagnostics = buildDiagnostics({ rows, characterGrades, ungraded, overall })
  const report: GradeExplainabilityReport = {
    schemaVersion: 1,
    generatedAt,
    player: {
      requestedNickname: options.nickname ?? null,
      resolvedNickname: identity.resolvedNickname,
      canonicalUserNum: identity.canonicalUserNum,
      canonicalUid: identity.canonicalUid,
      identitySource: identity.identitySource,
      verifiedSourceUids: identity.verifiedSourceUids,
    },
    scope: {
      seasonId: options.season,
      apiSeasonId: identity.apiSeasonId,
      matchMode: mode,
      currentTier: tier.displayLabel,
      tierKey,
      totalRankMatches: raw.deduplicatedMatchCount,
      aggregateMatchCount: overall.totalRankMatchCount,
      gradedMatchCount: overall.weightedMatchCount,
    },
    versions: {
      benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
      metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
      gradeCalibrationVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
      roleArtifactVersion: 'character-weapon-roles.v1',
      combatArtifactVersion: 'combat-participation-baselines.v1',
      snapshotVersion: 'character-grade-snapshot.v1',
    },
    snapshot: {
      status: snapshot?.status ?? 'unavailable',
      fingerprint: snapshot?.sourceFingerprint ?? null,
      computedAt: snapshot?.computedAt ?? null,
      sourceUpdatedAt: typeof meta?.generatedAt === 'string' ? meta.generatedAt : null,
      rowCount: rows.length,
      gradedRowCount: characterGrades.length,
      stale: Boolean(fingerprint && snapshot && fingerprint.value !== snapshot.sourceFingerprint),
    },
    overallGrade: overall,
    characterGrades,
    ungradedCharacters: options.includeUngraded === false ? [] : ungraded,
    matchGradeSamples: options.includeMatchSamples
      ? playerMatchSamples(raw.rows, options.matchSampleCount ?? 5)
      : [],
    distributionDiagnostics: diagnostics,
    warnings,
  }

  return { report, text: formatGradeExplainabilityText(report) }
}

function formatMetric(metric: MetricReport): string[] {
  return [
    `${metric.metric}`,
    `- 원본값: ${metric.rawValue ?? 'missing'}`,
    `- baseline: ${metric.baseline ?? 'missing'}`,
    `- 정규화 점수: ${metric.normalizedScore ?? '계산 불가'}`,
    `- 내부 가중치: ${metric.metricWeightPercent}%`,
    `- 최종 기여: ${metric.finalScoreContribution ?? '계산 불가'}`,
    `- direction: ${metric.direction}`,
    `- missing/fallback: ${metric.missing}/${metric.fallback}${metric.fallbackReason ? ` (${metric.fallbackReason})` : ''}`,
  ]
}

export function formatGradeExplainabilityText(report: GradeExplainabilityReport): string {
  const lines: string[] = [
    `ERCraft Grade Explainability Report`,
    `Generated: ${report.generatedAt}`,
    `Player: ${report.player.resolvedNickname ?? report.player.requestedNickname ?? report.player.canonicalUserNum}`,
    `Identity: ${report.player.identitySource} / userNum=${report.player.canonicalUserNum}`,
    `Scope: season=${report.scope.seasonId} apiSeason=${report.scope.apiSeasonId} mode=${report.scope.matchMode} tier=${report.scope.currentTier} (${report.scope.tierKey})`,
    '',
    '[종합 성과 등급]',
    `최종 등급: ${report.overallGrade.grade ?? '계산 불가'}`,
    `최종 성과 점수: ${report.overallGrade.score ?? '계산 불가'}`,
    '계산 방식: 캐릭터 성과 점수의 경기 수 가중 평균',
    `가중 점수 합: ${report.overallGrade.weightedScoreSum}`,
    `가중 경기 수: ${report.overallGrade.weightedMatchCount}`,
    `전체 랭크 경기 수: ${report.overallGrade.totalRankMatchCount}`,
    `등급 계산 포함 경기: ${report.overallGrade.weightedMatchCount}`,
    `제외 경기: ${report.overallGrade.excludedMatchCount}`,
    '',
    '기여도 상위:',
    ...report.overallGrade.characterContributions
      .filter((entry) => entry.included)
      .slice(0, 10)
      .map((entry, index) =>
        `${index + 1}. ${entry.characterName} / ${entry.weaponType ?? '-'} ${entry.matchCount}판 × ${entry.gradeScore} = ${entry.weightedContribution} (분모 ${(entry.shareOfDenominator ?? 0) * 100}%)`,
      ),
    '',
    '[B 이상 집중 원인 감사]',
    ...report.distributionDiagnostics.conclusion.map((line) => `- ${line}`),
    '',
    '[등급 계산 제외]',
    ...report.ungradedCharacters.map((row) =>
      `캐릭터: ${row.characterName} / ${row.weaponType ?? '-'} / ${row.matchCount}판 / 결과: ${row.gradeStatus ?? row.otherReasons.join(', ')} / 분모 포함: 아니오`,
    ),
    '',
  ]

  for (const row of report.characterGrades) {
    lines.push(
      '============================================================',
      `${row.characterName} / ${row.weaponType ?? '-'} / ${row.rolePreset ?? '-'}`,
      '============================================================',
      `경기 수: ${row.matchCount}`,
      `최종 등급: ${row.grade}`,
      `최종 성과 점수: ${row.gradeScore}`,
      `등급 계산 여부: 포함`,
      `기준 티어: ${row.benchmark.requestedTierKey}`,
      `선택 baseline: ${row.benchmark.selectedBaselineTierKey ?? 'none'}`,
      `fallback: ${row.benchmark.fallbackReasons.join(', ') || 'none'}`,
      `snapshot 상태: ${report.snapshot.status}`,
      '',
      '[최종 계산]',
      `Outcome: ${row.outcome.weightPercent}%`,
      `Role:    ${row.role.weightPercent}%`,
      `Outcome 점수: ${row.outcome.score ?? '계산 불가'}`,
      `Outcome 기여: ${row.outcome.score ?? '계산 불가'} × ${row.outcome.weight} = ${row.outcome.contributionToFinalScore ?? '계산 불가'}`,
      `Role 점수: ${row.role.score ?? '계산 불가'}`,
      `Role 기여: ${row.role.score ?? '계산 불가'} × ${row.role.weight} = ${row.role.contributionToFinalScore ?? '계산 불가'}`,
      `보정 전 점수: ${row.preConfidenceScore ?? '계산 불가'}`,
      '표본 신뢰도:',
      `- 적용 전: ${row.preConfidenceScore ?? '계산 불가'}`,
      `- confidence: ${row.sampleConfidence ?? '계산 불가'}`,
      `- 적용 후: ${row.postConfidenceScore}`,
      '',
      '[Outcome 지표]',
      ...row.outcome.metrics.flatMap(formatMetric),
      '',
      `[Role 지표] preset=${row.role.presetId}`,
      ...row.role.metrics.flatMap(formatMetric),
      '',
      '[등급 경계]',
      `현재 점수 ${row.gradeScore} -> ${row.grade}`,
      `현재 등급 최소: ${row.fineGradeThreshold.currentMin}`,
      `다음 등급까지: ${row.fineGradeThreshold.pointsToNextGrade ?? '최상위'}점`,
      `현재 경계 초과: ${row.fineGradeThreshold.pointsAboveCurrentMin ?? 'n/a'}점`,
      '',
      '[종합 등급 기여]',
      `${row.matchCount}판 × ${row.gradeScore} = ${row.overallContribution.weightedContribution}`,
      `전체 가중 점수에서 차지하는 비율: ${((row.overallContribution.shareOfWeightedScore ?? 0) * 100).toFixed(2)}%`,
      '',
    )
  }

  if (report.warnings.length > 0) {
    lines.push('[Warnings]', ...report.warnings.map((warning) => `- ${warning}`), '')
  }

  return `${lines.join('\n')}\n`
}

function averageBucket(rows: SeasonCharacterAggregateContract[]): AverageBucket {
  const graded = rows.filter((row) => rowGradeScore(row) != null)
  return {
    count: rows.length,
    matchCount: rows.reduce((sum, row) => sum + row.games, 0),
    averageScore: average(graded.map((row) => rowGradeScore(row) ?? 0)),
  }
}

function bucketBy(
  rows: SeasonCharacterAggregateContract[],
  key: (row: SeasonCharacterAggregateContract) => string,
): Record<string, AverageBucket> {
  const map = new Map<string, SeasonCharacterAggregateContract[]>()
  for (const row of rows) {
    const bucket = key(row)
    map.set(bucket, [...(map.get(bucket) ?? []), row])
  }
  const out: Record<string, AverageBucket> = {}
  for (const [keyName, bucketRows] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out[keyName] = averageBucket(bucketRows)
  }
  return out
}

export async function buildGradeDistributionSummary(
  prisma: PrismaClient,
  generatedAt = new Date().toISOString(),
): Promise<DistributionSummaryBuildResult> {
  const snapshots = await prisma.characterGradeSnapshot.findMany({
    orderBy: [{ computedAt: 'desc' }, { id: 'asc' }],
  })
  const entries: Array<{ row: SeasonCharacterAggregateContract; weaponType: string }> = []
  for (const snapshot of snapshots) {
    const rowsForSnapshot = parseCharacterStats(snapshot.characterStats)
    const matchRows = await prisma.playerMatch.findMany({
      where: { uid: snapshot.uid, apiSeasonId: snapshot.apiSeasonId, gameMode: snapshot.matchMode },
      orderBy: { playedAt: 'desc' },
    })
    const byCharacter = matchesByCharacterAndWeapon(matchRows)
    for (const row of rowsForSnapshot) {
      const primary = primaryWeaponGroup(byCharacter.get(row.characterNum))
      entries.push({
        row,
        weaponType: displayWeapon(primary?.weaponTypeId) ?? 'unknown',
      })
    }
  }
  const rows = entries.map((entry) => entry.row)
  const graded = rows.filter((row) => rowGradeScore(row) != null && rowGrade(row) != null)
  const gradeDistribution: Record<string, number> = {}
  const matchWeightedGradeDistribution: Record<string, number> = {}
  for (const row of graded) {
    const grade = rowGrade(row)
    if (!grade) continue
    addToCount(gradeDistribution, grade)
    addToCount(matchWeightedGradeDistribution, grade, row.games)
  }
  const beforeScores = graded.flatMap((row) => {
    const score = rowGradeScore(row)
    if (score == null) return []
    const sampleSize = row.gradeSampleSize ?? row.games
    const confidence = sampleConfidenceFactor(sampleSize)
    if (confidence <= 0) return []
    return [(score - 65) / confidence + 65]
  })
  const afterScores = graded.flatMap((row) => rowGradeScore(row) == null ? [] : [rowGradeScore(row) ?? 0])
  const summary: GradeDistributionSummary = {
    schemaVersion: 1,
    generatedAt,
    scope: {
      snapshotCount: snapshots.length,
      characterRowCount: rows.length,
      gradedRowCount: graded.length,
      ungradedRowCount: rows.length - graded.length,
    },
    gradeDistribution,
    matchWeightedGradeDistribution,
    tierAverageScores: bucketBy(graded, (row) => row.gradeBaselineTierKey ?? 'unknown'),
    roleAverageScores: bucketBy(graded, (row) => row.gradeRole ?? 'unknown'),
    characterAverageScores: bucketBy(graded, (row) => characterName(row)),
    weaponAverageScores: bucketEntriesBy(
      entries.filter((entry) => rowGradeScore(entry.row) != null && rowGrade(entry.row) != null),
      (entry) => entry.weaponType,
    ),
    fallbackLevelAverageScores: bucketBy(graded, (row) => row.gradeFallback?.baselineLevel ?? 'none'),
    confidenceDelta: {
      averageBefore: average(beforeScores),
      averageAfter: average(afterScores),
      averageDelta: beforeScores.length === afterScores.length && beforeScores.length > 0
        ? average(afterScores.map((value, index) => value - beforeScores[index]))
        : null,
    },
    ratios: {
      bOrAbove: graded.length > 0 ? roundNumber(graded.filter((row) => isGradeOrAbove(rowGrade(row), 'B')).length / graded.length, 4) : 0,
      aOrAbove: graded.length > 0 ? roundNumber(graded.filter((row) => isGradeOrAbove(rowGrade(row), 'A-')).length / graded.length, 4) : 0,
      sOrAbove: graded.length > 0 ? roundNumber(graded.filter((row) => isGradeOrAbove(rowGrade(row), 'S-')).length / graded.length, 4) : 0,
      ungraded: rows.length > 0 ? roundNumber((rows.length - graded.length) / rows.length, 4) : 0,
    },
    warnings: [
      'Distribution summary reads local snapshots only and intentionally omits nicknames.',
      'Weapon average requires per-player PlayerMatch grouping; snapshot rows are character-level.',
    ],
  }
  return { report: summary, text: formatDistributionSummaryText(summary) }
}

function bucketEntriesBy<T extends { row: SeasonCharacterAggregateContract }>(
  entries: T[],
  key: (entry: T) => string,
): Record<string, AverageBucket> {
  const map = new Map<string, SeasonCharacterAggregateContract[]>()
  for (const entry of entries) {
    const bucket = key(entry)
    map.set(bucket, [...(map.get(bucket) ?? []), entry.row])
  }
  const out: Record<string, AverageBucket> = {}
  for (const [keyName, bucketRows] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out[keyName] = averageBucket(bucketRows)
  }
  return out
}

export function formatDistributionSummaryText(summary: GradeDistributionSummary): string {
  const lines = [
    'ERCraft Grade Distribution Summary',
    `Generated: ${summary.generatedAt}`,
    `Snapshots: ${summary.scope.snapshotCount}`,
    `Rows: ${summary.scope.characterRowCount} (graded ${summary.scope.gradedRowCount}, ungraded ${summary.scope.ungradedRowCount})`,
    '',
    '[Grade Distribution]',
    ...Object.entries(summary.gradeDistribution).map(([grade, count]) => `- ${grade}: ${count}`),
    '',
    '[Match Weighted Grade Distribution]',
    ...Object.entries(summary.matchWeightedGradeDistribution).map(([grade, count]) => `- ${grade}: ${count}`),
    '',
    `[Ratios] B+? no, B 이상=${summary.ratios.bOrAbove}, A 이상=${summary.ratios.aOrAbove}, S 이상=${summary.ratios.sOrAbove}, ungraded=${summary.ratios.ungraded}`,
    '',
    '[Fallback Level Average]',
    ...Object.entries(summary.fallbackLevelAverageScores).map(
      ([key, bucket]) => `- ${key}: avg=${bucket.averageScore ?? 'n/a'} rows=${bucket.count} matches=${bucket.matchCount}`,
    ),
    '',
    '[Warnings]',
    ...summary.warnings.map((warning) => `- ${warning}`),
    '',
  ]
  return `${lines.join('\n')}\n`
}

export const deterministicGeneratedAtForTest = DEFAULT_GENERATED_AT
