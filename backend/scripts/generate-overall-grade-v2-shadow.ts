import 'dotenv/config'

import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { PrismaClient, type Prisma } from '@prisma/client'

import {
  buildOverallGradeV2ShadowArtifact,
  auditOverallV2DataAvailability,
  fineGradeCutsForReport,
  OVERALL_GRADE_V2_ARTIFACT_VERSION,
  OVERALL_GRADE_V2_SOURCE,
  type OverallV2Artifact,
  type OverallV2IdentityMap,
  type OverallV2MatchInput,
  type OverallV2PlayerSeasonRow,
} from '../src/audit/overallGradeV2Shadow.js'
import { buildCharacterAggregatesFromMatches } from '../src/cache/seasonAggregateBuilder.js'
import type {
  MatchSummaryContract,
  SeasonCharacterAggregateContract,
} from '../src/contracts/player.js'
import {
  applyCharacterPerformanceGrades,
  computeMatchPerformanceGrade,
  type StoredMatchGradeRow,
} from '../src/services/characterPerformanceGrade/compute.js'
import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
  scoreToFineGrade,
  type CharacterFineGrade,
} from '../src/services/characterPerformanceGrade/config.js'
import { isGradeSupportedMode } from '../src/types/matchesMode.js'
import { normalizeRankTier, type RankTier } from '../src/utils/rankTier.js'

const API_SEASON_ID = 39
const DISPLAY_SEASON_ID = 11
const TARGET_NICKNAMES = ['연서', '아드마이할게요', 'gapri'] as const
const ARTIFACT_DIR = resolve(process.cwd(), 'src', 'data', 'overallGrade')
const REPORT_DIR = resolve(process.cwd(), '..', 'reports', 'overall-grade-v2-shadow')
const DOC_PATH = resolve(process.cwd(), '..', 'docs', 'design', 'OVERALL_GRADE_V2_SHADOW_RESULT.md')

type PlayerMatchRow = Prisma.PlayerMatchGetPayload<object>

interface CurrentOverall {
  score: number | null
  grade: CharacterFineGrade | null
  gradedCharacterCount: number
  totalCharacterCount: number
  weightedMatchCount: number
}

interface TargetComparison {
  nickname: string
  canonicalUserNum: string | null
  currentOverall: CurrentOverall | null
  selfIncluded: OverallV2PlayerSeasonRow | null
  leaveOnePlayerOut: OverallV2PlayerSeasonRow | null
  delta: number | null
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
  const lowValue = sorted[low] ?? 0
  const highValue = sorted[high] ?? lowValue
  return round(lowValue * (1 - fraction) + highValue * fraction)
}

function ratio(count: number, total: number): number {
  if (total <= 0) return 0
  return round(count / total, 4) ?? 0
}

function countBy<T>(rows: T[], keyOf: (row: T) => string | null | undefined): Record<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyOf(row) ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])))
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

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let numerator = 0
  let xDenominator = 0
  let yDenominator = 0
  for (let index = 0; index < xs.length; index += 1) {
    const xDelta = (xs[index] ?? 0) - xMean
    const yDelta = (ys[index] ?? 0) - yMean
    numerator += xDelta * yDelta
    xDenominator += xDelta ** 2
    yDenominator += yDelta ** 2
  }
  const denominator = Math.sqrt(xDenominator * yDenominator)
  if (denominator === 0) return null
  return round(numerator / denominator, 4)
}

function sourceHash(rows: OverallV2PlayerSeasonRow[]): string {
  const payload = rows.map((row) => ({
    canonicalUserNum: row.canonicalUserNum,
    seasonId: row.seasonId,
    matchMode: row.matchMode,
    matchCount: row.matchCount,
    lastPlayedAt: row.lastPlayedAt,
    score: row.overallV2Score,
  }))
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

async function loadIdentities(prisma: PrismaClient): Promise<OverallV2IdentityMap> {
  const aliases = await prisma.profileIdentityAlias.findMany({
    where: { isActive: true },
    select: { canonicalUid: true, sourceUid: true },
  })
  const bindings = await prisma.profileNicknameBinding.findMany({
    select: { canonicalUid: true, canonicalUserNum: true },
  })
  const canonicalUidBySourceUid = new Map<string, string>()
  for (const alias of aliases) {
    canonicalUidBySourceUid.set(alias.sourceUid, alias.canonicalUid)
    canonicalUidBySourceUid.set(alias.canonicalUid, alias.canonicalUid)
  }
  for (const binding of bindings) {
    canonicalUidBySourceUid.set(binding.canonicalUid, binding.canonicalUid)
  }
  return {
    canonicalUidBySourceUid,
    canonicalUserNumByCanonicalUid: new Map(
      bindings.map((row) => [row.canonicalUid, row.canonicalUserNum.toString()]),
    ),
  }
}

async function loadRows(prisma: PrismaClient): Promise<PlayerMatchRow[]> {
  return prisma.playerMatch.findMany({
    where: {
      apiSeasonId: API_SEASON_ID,
      displaySeasonId: DISPLAY_SEASON_ID,
    },
    orderBy: [{ playedAt: 'desc' }, { gameId: 'desc' }],
  })
}

function latestTierByUid(rows: PlayerMatchRow[]): Map<string, RankTier> {
  const latest = new Map<string, PlayerMatchRow>()
  for (const row of rows) {
    if (!isGradeSupportedMode(row.gameMode)) continue
    const existing = latest.get(row.uid)
    if (!existing || row.playedAt > existing.playedAt) latest.set(row.uid, row)
  }
  return new Map(
    [...latest.entries()].map(([uid, row]) => [
      uid,
      normalizeRankTier({ rp: row.rpAfter, displaySeason: row.displaySeasonId }),
    ]),
  )
}

function toMatchSummary(row: PlayerMatchRow, userNum: number): MatchSummaryContract {
  return {
    matchId: row.gameId,
    userNum,
    characterNum: row.characterNum,
    characterName: row.characterName ?? `실험체 #${row.characterNum}`,
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
    gameMode: row.gameMode === 'rank' ? 'rank' : 'normal',
    bestWeapon: row.bestWeapon ?? undefined,
  }
}

function currentOverallFromCharacters(rows: SeasonCharacterAggregateContract[]): CurrentOverall {
  const included = rows.filter((row) => row.gradeScore != null && row.gradeStatus === 'ok')
  const weightedScoreSum = included.reduce((sum, row) => sum + (row.gradeScore ?? 0) * row.games, 0)
  const weightedMatchCount = included.reduce((sum, row) => sum + row.games, 0)
  const score = weightedMatchCount > 0 ? round(weightedScoreSum / weightedMatchCount) : null
  return {
    score,
    grade: score == null ? null : scoreToFineGrade(score),
    gradedCharacterCount: included.length,
    totalCharacterCount: rows.length,
    weightedMatchCount,
  }
}

function buildCurrentOverallByCanonicalUserNum(
  rows: PlayerMatchRow[],
  identities: OverallV2IdentityMap,
): Map<string, CurrentOverall> {
  const tierByUid = latestTierByUid(rows)
  const grouped = new Map<string, PlayerMatchRow[]>()
  for (const row of rows) {
    if (!isGradeSupportedMode(row.gameMode)) continue
    const canonicalUid = identities.canonicalUidBySourceUid.get(row.uid) ?? row.uid
    const canonicalUserNum =
      identities.canonicalUserNumByCanonicalUid.get(canonicalUid) ??
      `shadow-${createHash('sha256').update(canonicalUid).digest('hex').slice(0, 16)}`
    const bucket = grouped.get(canonicalUserNum) ?? []
    bucket.push(row)
    grouped.set(canonicalUserNum, bucket)
  }

  const out = new Map<string, CurrentOverall>()
  for (const [canonicalUserNum, userRows] of grouped) {
    const primaryUid = identities.canonicalUidBySourceUid.get(userRows[0]?.uid ?? '') ?? userRows[0]?.uid ?? ''
    const tier = tierByUid.get(primaryUid) ?? tierByUid.get(userRows[0]?.uid ?? '') ?? null
    const numericUserNum = Number.parseInt(canonicalUserNum.replace(/\D/g, '').slice(0, 10), 10)
    const summaries = userRows.map((row) => toMatchSummary(row, Number.isFinite(numericUserNum) ? numericUserNum : 0))
    const aggregates = buildCharacterAggregatesFromMatches(summaries, DISPLAY_SEASON_ID, API_SEASON_ID)
    const graded = applyCharacterPerformanceGrades({
      rows: userRows,
      characterStats: aggregates,
      metaStatus: 'complete',
      playerTier: tier,
    })
    out.set(canonicalUserNum, currentOverallFromCharacters(graded))
  }
  return out
}

function buildShadowInputs(rows: PlayerMatchRow[]): OverallV2MatchInput[] {
  const tierByUid = latestTierByUid(rows)
  return rows.map((row) => {
    const tier = tierByUid.get(row.uid) ?? null
    const grade = isGradeSupportedMode(row.gameMode)
      ? computeMatchPerformanceGrade({
          row: row as StoredMatchGradeRow,
          playerTier: tier,
          displaySeasonId: row.displaySeasonId,
        })
      : null
    return {
      uid: row.uid,
      gameId: row.gameId,
      apiSeasonId: row.apiSeasonId,
      displaySeasonId: row.displaySeasonId,
      gameMode: row.gameMode,
      playedAt: row.playedAt,
      characterNum: row.characterNum,
      bestWeapon: row.bestWeapon,
      rpAfter: row.rpAfter,
      placement: row.placement,
      victory: row.victory,
      kills: row.kills,
      assists: row.assists,
      deaths: row.deaths,
      teamKills: row.teamKills,
      damageToPlayer: row.damageToPlayer,
      viewContribution: row.viewContribution == null ? null : Number(row.viewContribution),
      monsterKill: row.monsterKill,
      gameDuration: row.gameDuration,
      matchGradeScore: grade?.matchGradeScore ?? null,
    }
  })
}

async function loadTargetCanonicalUserNums(
  prisma: PrismaClient,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (const nickname of TARGET_NICKNAMES) {
    const binding = await prisma.profileNicknameBinding.findUnique({
      where: { normalizedNickname: nickname.toLowerCase() },
      select: { canonicalUserNum: true },
    })
    out.set(nickname, binding?.canonicalUserNum.toString() ?? null)
  }
  return out
}

function compareTargets(params: {
  artifact: OverallV2Artifact
  leaveOneArtifacts: Map<string, OverallV2Artifact>
  currentOverallByUser: Map<string, CurrentOverall>
  targetUserNums: Map<string, string | null>
}): TargetComparison[] {
  return [...params.targetUserNums.entries()].map(([nickname, canonicalUserNum]) => {
    const selfIncluded = canonicalUserNum
      ? params.artifact.rows.find((row) => row.canonicalUserNum === canonicalUserNum) ?? null
      : null
    const leaveOnePlayerOut = canonicalUserNum
      ? params.leaveOneArtifacts.get(canonicalUserNum)?.rows.find((row) => row.canonicalUserNum === canonicalUserNum) ?? null
      : null
    const delta =
      selfIncluded?.overallV2Score != null && leaveOnePlayerOut?.overallV2Score != null
        ? round(leaveOnePlayerOut.overallV2Score - selfIncluded.overallV2Score)
        : null
    return {
      nickname,
      canonicalUserNum,
      currentOverall: canonicalUserNum ? params.currentOverallByUser.get(canonicalUserNum) ?? null : null,
      selfIncluded,
      leaveOnePlayerOut,
      delta,
    }
  })
}

function distributionReport(artifact: OverallV2Artifact, currentOverallByUser: Map<string, CurrentOverall>) {
  const rows = artifact.rows
  const scores = rows.flatMap((row) => row.overallV2Score == null ? [] : [row.overallV2Score])
  const currentAndV2 = rows.flatMap((row) => {
    const current = currentOverallByUser.get(row.canonicalUserNum)?.score ?? null
    return current != null && row.overallV2Score != null ? [{ current, v2: row.overallV2Score }] : []
  })
  const components = rows.flatMap((row) =>
    row.outcomePerformanceScore != null &&
    row.rolePerformanceScore != null &&
    row.consistencyScore != null
      ? [{
          outcome: row.outcomePerformanceScore,
          role: row.rolePerformanceScore,
          consistency: row.consistencyScore,
        }]
      : [],
  )
  return {
    playerSeasonRows: rows.length,
    uniquePlayers: new Set(rows.map((row) => row.canonicalUserNum)).size,
    totalRankMatches: rows.reduce((sum, row) => sum + row.matchCount, 0),
    tierRows: countBy(rows, (row) => row.tierBand),
    roleRows: countBy(rows, (row) => row.primaryRole),
    matchCount: scoreSummary(rows.map((row) => row.matchCount)),
    cohortPlayerSeasonCount: scoreSummary(artifact.cohorts.map((cohort) => cohort.playerSeasonCount)),
    fallback: countBy(rows, (row) => row.fallbackLevel),
    confidence: countBy(rows, (row) => row.confidenceLabel),
    scores: scoreSummary(scores),
    broadGrade: countBy(rows, (row) => row.broadThresholdGrade),
    quantileGrade: countBy(rows, (row) => row.quantileCandidateGrade),
    percentileNullRate: ratio(rows.filter((row) => row.outcomeEmpiricalPercentile == null).length, rows.length),
    correlations: {
      outcomeRole: pearson(components.map((row) => row.outcome), components.map((row) => row.role)),
      outcomeConsistency: pearson(components.map((row) => row.outcome), components.map((row) => row.consistency)),
      roleConsistency: pearson(components.map((row) => row.role), components.map((row) => row.consistency)),
      currentOverallToV2: pearson(currentAndV2.map((row) => row.current), currentAndV2.map((row) => row.v2)),
    },
    tierAverage: Object.fromEntries(
      Object.entries(groupScores(rows, (row) => row.tierBand)).map(([key, values]) => [key, scoreSummary(values)]),
    ),
    roleAverage: Object.fromEntries(
      Object.entries(groupScores(rows, (row) => row.primaryRole ?? 'unknown')).map(([key, values]) => [key, scoreSummary(values)]),
    ),
    outliers: [...rows]
      .filter((row) => row.overallV2Score != null)
      .sort((a, b) => (b.overallV2Score ?? 0) - (a.overallV2Score ?? 0))
      .slice(0, 10)
      .map((row) => ({
        canonicalUserNum: row.canonicalUserNum,
        score: row.overallV2Score,
        tierBand: row.tierBand,
        primaryRole: row.primaryRole,
        matchCount: row.matchCount,
        confidence: row.confidenceLabel,
      })),
  }
}

function groupScores(
  rows: OverallV2PlayerSeasonRow[],
  keyOf: (row: OverallV2PlayerSeasonRow) => string,
): Record<string, number[]> {
  const groups = new Map<string, number[]>()
  for (const row of rows) {
    if (row.overallV2Score == null) continue
    const key = keyOf(row)
    const bucket = groups.get(key) ?? []
    bucket.push(row.overallV2Score)
    groups.set(key, bucket)
  }
  return Object.fromEntries(groups)
}

function buildManifest(artifact: OverallV2Artifact) {
  const rows = artifact.rows
  return {
    schemaVersion: 1,
    artifactVersion: OVERALL_GRADE_V2_ARTIFACT_VERSION,
    source: OVERALL_GRADE_V2_SOURCE,
    generatedAt: artifact.generatedAt,
    sourceWindow: {
      firstPlayedAt: rows.map((row) => row.firstPlayedAt).filter(Boolean).sort()[0] ?? null,
      lastPlayedAt: rows.map((row) => row.lastPlayedAt).filter(Boolean).sort().at(-1) ?? null,
    },
    sourceHash: sourceHash(rows),
    benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
    metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
    rowCount: rows.length,
    uniquePlayerCount: new Set(rows.map((row) => row.canonicalUserNum)).size,
    totalMatchCount: rows.reduce((sum, row) => sum + row.matchCount, 0),
    supportedModes: ['rank'],
    excludedModes: ['cobalt', 'normal', 'union'],
    minCohortSize: 12,
    percentileMinCohortSize: 20,
    fineGradeCuts: fineGradeCutsForReport(),
    warning: 'experimental-player-matches-shadow only; not a production benchmark',
  }
}

function buildText(report: {
  generatedAt: string
  dataAvailability: ReturnType<typeof auditOverallV2DataAvailability>
  manifest: ReturnType<typeof buildManifest>
  distribution: ReturnType<typeof distributionReport>
  targetComparisons: TargetComparison[]
}) {
  const lines = [
    '# 39.11S Overall Grade V2 Shadow Benchmark',
    '',
    `generatedAt: ${report.generatedAt}`,
    `source: ${OVERALL_GRADE_V2_SOURCE}`,
    `rows: ${report.manifest.rowCount}, uniquePlayers: ${report.manifest.uniquePlayerCount}, matches: ${report.manifest.totalMatchCount}`,
    `sourceHash: ${report.manifest.sourceHash}`,
    '',
    '## Formula',
    '- Overall V2 = Outcome 30% + Role 50% + Consistency 20%',
    '- Outcome uses top3Rate 45%, averagePlacement 35%, bottomRate 20%. Win/top2 are audited but not double-counted in the score.',
    '- Role uses existing ROLE_PRESET_WEIGHTS for the player-season primary role.',
    '- Consistency uses median 35%, lower quartile 35%, volatility 15%, C-or-lower rate 15%.',
    '',
    '## Distribution',
    `- score mean=${report.distribution.scores.mean}, median=${report.distribution.scores.median}, p10=${report.distribution.scores.p10}, p90=${report.distribution.scores.p90}, p95=${report.distribution.scores.p95}`,
    `- fallback=${JSON.stringify(report.distribution.fallback)}`,
    `- confidence=${JSON.stringify(report.distribution.confidence)}`,
    `- broadGrade=${JSON.stringify(report.distribution.broadGrade)}`,
    `- quantileGrade=${JSON.stringify(report.distribution.quantileGrade)}`,
    `- correlations=${JSON.stringify(report.distribution.correlations)}`,
    '',
    '## Target comparison',
  ]
  for (const target of report.targetComparisons) {
    const included = target.selfIncluded
    const loo = target.leaveOnePlayerOut
    lines.push(
      `- ${target.nickname}: current=${target.currentOverall?.score ?? null}/${target.currentOverall?.grade ?? null}, v2=${included?.overallV2Score ?? null}/${included?.overallV2Grade ?? null}, loo=${loo?.overallV2Score ?? null}/${loo?.overallV2Grade ?? null}, delta=${target.delta}`,
      `  components: outcome=${included?.outcomePerformanceScore ?? null}*0.30=${included?.componentContributions.outcome ?? null}, role=${included?.rolePerformanceScore ?? null}*0.50=${included?.componentContributions.role ?? null}, consistency=${included?.consistencyScore ?? null}*0.20=${included?.componentContributions.consistency ?? null}`,
      `  cohort=${included?.benchmarkKey ?? null}, cohortCount=${included?.cohortPlayerSeasonCount ?? null}, fallback=${included?.fallbackLevel ?? null}, confidence=${included?.confidenceLabel ?? null}`,
    )
  }
  lines.push(
    '',
    '## Data availability',
    `- available=${report.dataAvailability.available.join(', ')}`,
    `- derivable=${report.dataAvailability.derivable.join(', ')}`,
    `- missing=${report.dataAvailability.missing.join(', ')}`,
    `- unreliable=${report.dataAvailability.unreliable.join(', ')}`,
    '',
    '## Notes',
    '- No DB write, external API call, snapshot write, API route, or UI change is performed by this generator.',
    '- Percentile fields are null when cohort sample is below the configured threshold.',
    '- Search-user and high-tier bias are expected because player_matches is search-driven.',
  )
  return `${lines.join('\n')}\n`
}

function buildDoc(report: {
  generatedAt: string
  manifest: ReturnType<typeof buildManifest>
  distribution: ReturnType<typeof distributionReport>
  targetComparisons: TargetComparison[]
}) {
  return `# Overall Grade V2 Shadow Result

Generated at: ${report.generatedAt}

This is a shadow-only design result. It is not wired to production API, UI, snapshots, or the current overall grade.

## Verdict

보류. 현재 \`player_matches\` corpus는 검색 사용자 중심이고, cohort fallback 비율이 높아 production 연결 전 추가 데이터와 threshold 재설계가 필요하다.

## Formula

\`\`\`text
Overall V2 = Outcome Performance 30% + Role Performance 50% + Consistency 20%
\`\`\`

- Outcome: top3Rate 45%, averagePlacement 35%, bottomRate 20%.
- Role: 기존 \`ROLE_PRESET_WEIGHTS\`를 primary role에 그대로 적용.
- Consistency: median stability 35%, lower-tail protection 35%, volatility control 15%, C-or-lower protection 15%.

## Dataset

- Source: \`${OVERALL_GRADE_V2_SOURCE}\`
- Rows: ${report.manifest.rowCount}
- Unique players: ${report.manifest.uniquePlayerCount}
- Matches: ${report.manifest.totalMatchCount}
- Modes: rank only
- Excluded: cobalt, normal, union
- Source hash: \`${report.manifest.sourceHash}\`

## Distribution

- Overall V2 mean: ${report.distribution.scores.mean}
- Median: ${report.distribution.scores.median}
- p10/p90/p95: ${report.distribution.scores.p10} / ${report.distribution.scores.p90} / ${report.distribution.scores.p95}
- Confidence: \`${JSON.stringify(report.distribution.confidence)}\`
- Fallback: \`${JSON.stringify(report.distribution.fallback)}\`

## Target Notes

${report.targetComparisons.map((target) => `- ${target.nickname}: current ${target.currentOverall?.score ?? 'n/a'} / V2 ${target.selfIncluded?.overallV2Score ?? 'n/a'} / LOO ${target.leaveOnePlayerOut?.overallV2Score ?? 'n/a'}`).join('\n')}

## Risk

- 현재 artifact는 production benchmark가 아니다.
- 실제 percentile은 cohort 표본이 충분한 경우에만 채웠다.
- missing component는 자동 가중치 재분배하지 않았다.
- 팀운, 매칭 운, 팀원 수행도는 구현하지 않았다.
`
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const rows = await loadRows(prisma)
    const rankRows = rows.filter((row) => isGradeSupportedMode(row.gameMode))
    const identities = await loadIdentities(prisma)
    const inputs = buildShadowInputs(rows)
    const generatedAt = new Date().toISOString()
    const artifact = buildOverallGradeV2ShadowArtifact(inputs, identities, { generatedAt })
    const targetUserNums = await loadTargetCanonicalUserNums(prisma)
    const leaveOneArtifacts = new Map<string, OverallV2Artifact>()
    for (const canonicalUserNum of targetUserNums.values()) {
      if (!canonicalUserNum) continue
      leaveOneArtifacts.set(
        canonicalUserNum,
        buildOverallGradeV2ShadowArtifact(inputs, identities, {
          generatedAt,
          leaveOneCanonicalUserNum: canonicalUserNum,
        }),
      )
    }
    const currentOverallByUser = buildCurrentOverallByCanonicalUserNum(rows, identities)
    const manifest = buildManifest(artifact)
    const distribution = distributionReport(artifact, currentOverallByUser)
    const targetComparisons = compareTargets({
      artifact,
      leaveOneArtifacts,
      currentOverallByUser,
      targetUserNums,
    })
    const report = {
      schemaVersion: 1,
      generatedAt,
      source: OVERALL_GRADE_V2_SOURCE,
      protectedProduction: {
        benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
        metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
        noApiUiSnapshotChange: true,
      },
      dataAvailability: auditOverallV2DataAvailability(),
      manifest,
      distribution,
      targetComparisons,
      rowSamples: artifact.rows.slice(0, 20),
      notes: [
        'Artifact rows do not store nicknames.',
        'Credits are missing in player_matches and are not zero-filled.',
        'Cobalt and non-rank rows are excluded from player-season rows.',
        'Leave-one-player-out excludes the evaluated player-season row from cohort distributions.',
      ],
    }

    await mkdir(ARTIFACT_DIR, { recursive: true })
    await mkdir(REPORT_DIR, { recursive: true })
    await mkdir(resolve(process.cwd(), '..', 'docs', 'design'), { recursive: true })
    await writeFile(
      resolve(ARTIFACT_DIR, 'player-season-benchmark.shadow.v1.json'),
      JSON.stringify(artifact, null, 2),
      'utf8',
    )
    await writeFile(
      resolve(ARTIFACT_DIR, 'player-season-benchmark.shadow.v1.manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    )
    await writeFile(
      resolve(REPORT_DIR, 'overall-grade-v2-shadow.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    )
    await writeFile(resolve(REPORT_DIR, 'overall-grade-v2-shadow.txt'), buildText(report), 'utf8')
    await writeFile(DOC_PATH, buildDoc(report), 'utf8')

    console.log(JSON.stringify({
      artifact: resolve(ARTIFACT_DIR, 'player-season-benchmark.shadow.v1.json'),
      report: resolve(REPORT_DIR, 'overall-grade-v2-shadow.json'),
      rankInputRows: rankRows.length,
      playerSeasonRows: artifact.rows.length,
      uniquePlayers: manifest.uniquePlayerCount,
      sourceHash: manifest.sourceHash,
    }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

await main()
