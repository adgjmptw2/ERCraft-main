import {
  buildFeedbackFromReport,
  buildSummaryFromMetrics,
  computePlayerMetrics,
  pickBestCharacter,
  splitStrengthsWeaknesses,
} from '@/analysis/feedbackRules'
import { buildRealPlayStyleAnalysisFromProductionAxes } from '@/analysis/realPlayStyleAnalysis'
import {
  computeAnalysisEligibility,
  type AnalysisEligibilityResult,
} from '@/analysis/analysisEligibility'
import type { PlayerPlayStyleAnalysis } from '@/analysis/playStyleTypes'
import type {
  AnalysisGrade,
  CharacterAnalysisReport,
  MetricComparison,
  PlayerAnalysisReport,
  PlayerMetricSnapshot,
} from '@/analysis/types'
import type { MatchSummary } from '@/types/match'
import type { OverallGradeV2DTO, PlayerStatsDTO, PlayerCharacterStat } from '@/types/player'
import {
  buildProfileCharacterReports,
  filterProfileCharacterStatMatches,
  filterSeasonMatches,
  profileCharacterStatsBasisLabel,
} from '@/utils/characterStatsFromMatches'
import { resolveCharacterDisplayName } from '@/utils/gameLabels'

const MIN_MATCH_SAMPLE = 3
const MIN_SEASON_GAMES = 3
const MIN_SEASON_CHARACTER_GAMES = 3

export const SEASON_CHARACTER_STATS_LABEL = '시즌 집계 기준'

/** player-match source UI label — 내부 source id와 분리 */
export const RANK_AGGREGATE_STATS_LABEL = '랭크 집계 기준'

export type CharacterStatsSource = 'season' | 'recent-matches'

export interface RealProfileAnalysisInput {
  nickname: string
  statsDto: PlayerStatsDTO | null | undefined
  currentSeason: number | undefined
  selectedSeason: number
  loadedMatches: ReadonlyArray<MatchSummary>
}

export interface RealProfileAnalysisOutput {
  analysisReport: PlayerAnalysisReport | null
  analysisCharacterReports: CharacterAnalysisReport[]
  analysisMatches: MatchSummary[]
  /** 시즌 필터만 적용한 로드 경기 (표본 breakdown용) */
  analysisSeasonMatches: MatchSummary[]
  analysisEligibility: AnalysisEligibilityResult
  acceptLoadedSeasonFallback: boolean
  analysisBasisLabel: string
  playStyleAnalysis: PlayerPlayStyleAnalysis
  characterStatsSource: CharacterStatsSource | null
  characterStatsSourceLabel: string | null
  recentMatchesBasisLabel: string | null
}

type MetricKey = 'avgPlacement' | 'avgKills' | 'avgAssists' | 'kda' | 'top3Rate' | 'winRate'

const REAL_METRIC_DEFS: Array<{
  key: MetricKey
  label: string
  direction: 'higher-better' | 'lower-better'
  description: string
  pick: (m: PlayerMetricSnapshot) => number
}> = [
  {
    key: 'avgPlacement',
    label: '평균 순위',
    direction: 'lower-better',
    description: '로드된 랭크 경기 평균 순위',
    pick: (m) => m.avgPlacement,
  },
  {
    key: 'avgKills',
    label: '평균 킬',
    direction: 'higher-better',
    description: '로드된 랭크 경기 평균 킬',
    pick: (m) => m.avgKills,
  },
  {
    key: 'avgAssists',
    label: '평균 어시스트',
    direction: 'higher-better',
    description: '로드된 랭크 경기 평균 어시스트',
    pick: (m) => m.avgAssists,
  },
  {
    key: 'kda',
    label: 'KDA',
    direction: 'higher-better',
    description: '로드된 랭크 경기 KDA',
    pick: (m) => m.kda,
  },
  {
    key: 'top3Rate',
    label: '상위 3위 비율',
    direction: 'higher-better',
    description: '로드된 랭크 경기 상위 3위 비율(%)',
    pick: (m) => m.top3Rate,
  },
  {
    key: 'winRate',
    label: '승리 비율',
    direction: 'higher-better',
    description: '로드된 랭크 경기 승리 비율(%)',
    pick: (m) => m.winRate,
  },
]

function insufficientRealReport(
  _nickname: string,
  matchCount: number,
  reason: string,
  basisLabel: string,
): PlayerAnalysisReport {
  return {
    status: 'insufficient',
    overallGrade: null,
    overallPerformanceScore: null,
    overallScoreSource: 'unavailable',
    gradedCharacterCount: 0,
    weightedMatchCount: 0,
    confidenceStatus: 'unavailable',
    overallPercentile: null,
    summary: reason,
    metrics: [],
    strengths: [],
    weaknesses: [],
    feedbackItems: [],
    sampleSize: 0,
    baselineLabel: basisLabel,
    playerMatchCount: matchCount,
    bestCharacter: null,
  }
}

function buildRealMetricComparison(
  def: (typeof REAL_METRIC_DEFS)[number],
  snapshot: PlayerMetricSnapshot,
): MetricComparison {
  return {
    key: def.key,
    label: def.label,
    direction: def.direction,
    playerValue: def.pick(snapshot),
    populationMean: null,
    percentile: null,
    grade: null,
    description: def.description,
  }
}

function analysisGradeFromCharacterGradeScore(score: number): AnalysisGrade {
  if (score >= 88) return 'S'
  if (score >= 72) return 'A'
  if (score >= 56) return 'B'
  if (score >= 38) return 'C'
  return 'D'
}

export function resolveTierConditionedOverallGrade(
  reports: ReadonlyArray<CharacterAnalysisReport>,
): { grade: AnalysisGrade; score: number; sampleSize: number; gradedCharacterCount: number } | null {
  let weighted = 0
  let totalWeight = 0
  let gradedCharacterCount = 0

  for (const report of reports) {
    if (report.status !== 'ok') continue
    if (report.gradeStatus !== 'ok') continue
    if (report.gradeScore == null || !Number.isFinite(report.gradeScore)) continue
    const weight =
      report.gradeSampleSize != null &&
      Number.isFinite(report.gradeSampleSize) &&
      report.gradeSampleSize > 0
        ? report.gradeSampleSize
        : report.matchCount
    if (!Number.isFinite(weight) || weight <= 0) continue
    weighted += report.gradeScore * weight
    totalWeight += weight
    gradedCharacterCount += 1
  }

  if (totalWeight < MIN_SEASON_GAMES) return null

  const score = Math.round((weighted / totalWeight) * 10) / 10
  return {
    grade: analysisGradeFromCharacterGradeScore(score),
    score,
    sampleSize: totalWeight,
    gradedCharacterCount,
  }
}

export function applyTierConditionedOverallGrade(
  report: PlayerAnalysisReport | null,
  characterReports: ReadonlyArray<CharacterAnalysisReport>,
  basisLabel: string | null | undefined,
  overallGradeV2?: OverallGradeV2DTO | null,
): PlayerAnalysisReport | null {
  if (!report || report.status !== 'ok') return report

  if (overallGradeV2?.overallPerformanceScore != null && overallGradeV2.overallGrade != null) {
    const aggregateScoreSource =
      overallGradeV2.overallScoreSource === 'overall-aggregate-grade-v2' ||
      overallGradeV2.overallScoreSource === 'overall-aggregate-grade-v3' ||
      overallGradeV2.overallScoreSource === 'overall-aggregate-grade-v4'
    const sourceLabel =
      overallGradeV2.overallScoreSource === 'overall-v2-hybrid'
        ? 'overall-v2-hybrid'
        : aggregateScoreSource
          ? overallGradeV2.overallScoreSource
          : 'character-grade-weighted-average-fallback'
    return {
      ...report,
      overallGrade: overallGradeV2.overallGrade,
      overallPerformanceScore: overallGradeV2.overallPerformanceScore,
      overallScoreSource: sourceLabel,
      basePerformanceScore: overallGradeV2.basePerformanceScore,
      outcomePerformanceScore: overallGradeV2.outcomePerformanceScore,
      consistencyScore: overallGradeV2.consistencyScore,
      outcomeModifier: overallGradeV2.outcomeModifier,
      consistencyModifier: overallGradeV2.consistencyModifier,
      totalModifier: overallGradeV2.totalModifier,
      overallConfidence: overallGradeV2.overallConfidence,
      overallConfidenceLabel: overallGradeV2.overallConfidenceLabel,
      gradedCharacterCount: overallGradeV2.gradedCharacterCount,
      weightedMatchCount: overallGradeV2.weightedMatchCount,
      confidenceStatus:
        overallGradeV2.overallConfidenceLabel === 'insufficient' ? 'low-sample' : 'ready',
      overallPercentile: null,
      summary:
        sourceLabel === 'overall-v2-hybrid'
          ? '캐릭터별 성과를 기본으로 하고, 이번 시즌 결과와 경기 일관성을 보정한 점수입니다.'
          : aggregateScoreSource
            ? `${basisLabel ?? RANK_AGGREGATE_STATS_LABEL} 경기 성과를 ${overallGradeV2.weightedMatchCount}경기 기준으로 산정했습니다.`
          : `${basisLabel ?? RANK_AGGREGATE_STATS_LABEL} 캐릭터 성과 등급을 ${overallGradeV2.weightedMatchCount}경기 기준으로 가중 산정했습니다.`,
      sampleSize: overallGradeV2.weightedMatchCount,
      baselineLabel: basisLabel ?? report.baselineLabel,
    }
  }

  const resolved = resolveTierConditionedOverallGrade(characterReports)
  if (!resolved) return report

  return {
    ...report,
    overallGrade: resolved.grade,
    overallPerformanceScore: resolved.score,
    overallScoreSource: 'character-grade-weighted-average',
    gradedCharacterCount: resolved.gradedCharacterCount,
    weightedMatchCount: resolved.sampleSize,
    confidenceStatus: resolved.sampleSize >= 20 ? 'ready' : 'low-sample',
    overallPercentile: null,
    summary: `${basisLabel ?? RANK_AGGREGATE_STATS_LABEL} 캐릭터 성과 등급을 ${resolved.sampleSize}경기 기준으로 가중 산정했습니다.`,
    sampleSize: resolved.sampleSize,
    baselineLabel: basisLabel ?? report.baselineLabel,
  }
}

function snapshotFromStatsDto(statsDto: PlayerStatsDTO): PlayerMetricSnapshot | null {
  if (statsDto.games <= 0) return null
  return {
    avgPlacement: statsDto.avgPlacement,
    avgKills: statsDto.avgKills,
    avgAssists: 0,
    kda: statsDto.kda,
    top3Rate: 0,
    winRate: statsDto.winRate,
    matchCount: statsDto.games,
  }
}

export function buildRealModePlayerReport(params: {
  nickname: string
  matches: MatchSummary[]
  statsDto: PlayerStatsDTO | null | undefined
  basisLabel: string
}): PlayerAnalysisReport {
  const { nickname, matches, statsDto, basisLabel } = params

  const fromMatches = matches.length >= MIN_MATCH_SAMPLE ? computePlayerMetrics(matches) : null
  const fromSeason =
    !fromMatches && statsDto && statsDto.games >= MIN_SEASON_GAMES
      ? snapshotFromStatsDto(statsDto)
      : null
  const snapshot = fromMatches ?? fromSeason

  if (!snapshot) {
    return insufficientRealReport(
      nickname,
      matches.length,
      matches.length > 0
        ? `분석할 최근 랭크 경기가 부족합니다. (최소 ${MIN_MATCH_SAMPLE}경기)`
        : '최근 랭크 경기 데이터가 없습니다.',
      basisLabel,
    )
  }

  const metrics = REAL_METRIC_DEFS.map((def) => buildRealMetricComparison(def, snapshot))
  const bestCharacter = pickBestCharacter(matches)
  const draft: PlayerAnalysisReport = {
    status: 'ok',
    overallGrade: null,
    overallPerformanceScore: null,
    overallScoreSource: 'legacy-profile-analysis',
    gradedCharacterCount: 0,
    weightedMatchCount: 0,
    confidenceStatus: 'unavailable',
    overallPercentile: null,
    summary: buildSummaryFromMetrics(metrics, null),
    metrics: metrics.slice(0, 5),
    strengths: [],
    weaknesses: [],
    feedbackItems: [],
    sampleSize: snapshot.matchCount,
    baselineLabel: basisLabel,
    playerMatchCount: matches.length > 0 ? matches.length : snapshot.matchCount,
    bestCharacter,
  }

  const feedback = buildFeedbackFromReport(draft)
  const { strengths, weaknesses } = splitStrengthsWeaknesses(feedback)

  return {
    ...draft,
    summary:
      fromMatches != null
        ? `최근 ${matches.length}경기 랭크 기준으로 핵심 지표를 정리했습니다.`
        : `시즌 집계 통계 기준으로 핵심 지표를 정리했습니다.`,
    strengths,
    weaknesses,
    feedbackItems: feedback,
  }
}

function mapSeasonCharacterStat(stat: PlayerCharacterStat): CharacterAnalysisReport {
  const games = stat.totalGames
  const wins = stat.wins ?? 0
  const top3 = stat.top3 ?? 0
  const winRate = games > 0 ? (wins / games) * 100 : 0
  const top3Rate = games > 0 ? (top3 / games) * 100 : 0
  const avgPlacement = stat.averageRank ?? 0
  const characterName = resolveCharacterDisplayName(stat.characterCode, undefined)

  const summary = {
    characterNum: stat.characterCode,
    characterName,
    matchCount: games,
    avgPlacement,
    avgKills: Number.NaN,
    avgAssists: Number.NaN,
    avgTeamKills: null,
    avgDamageToPlayers: null,
    kda: Number.NaN,
    top3Rate,
    winRate,
    overallScore: null,
  }

  const status = games >= MIN_SEASON_CHARACTER_GAMES ? ('ok' as const) : ('insufficient-sample' as const)

  return {
    ...summary,
    status,
    overallGrade: null,
    gradeLabel: status === 'ok' ? '시즌' : '-',
    feedback:
      status === 'ok'
        ? '공식 API 시즌 집계 기준입니다.'
        : '시즌 표본이 부족해 참고용으로만 표시합니다.',
  }
}

export function buildRealProfileCharacterReports(
  characterStats: PlayerCharacterStat[] | undefined,
  matches: MatchSummary[],
): {
  reports: CharacterAnalysisReport[]
  source: CharacterStatsSource | null
  sourceLabel: string | null
} {
  const rankMatches = filterProfileCharacterStatMatches(matches)
  if (rankMatches.length > 0) {
    return {
      reports: buildProfileCharacterReports(rankMatches),
      source: 'recent-matches',
      sourceLabel: profileCharacterStatsBasisLabel(rankMatches.length),
    }
  }

  const seasonRows = (characterStats ?? []).filter((row) => row.totalGames > 0)
  if (seasonRows.length > 0) {
    const reports = seasonRows
      .map(mapSeasonCharacterStat)
      .sort((a, b) => b.matchCount - a.matchCount)
    return {
      reports,
      source: 'season',
      sourceLabel: SEASON_CHARACTER_STATS_LABEL,
    }
  }

  return { reports: [], source: null, sourceLabel: null }
}

export function buildRealProfileAnalysis(
  input: RealProfileAnalysisInput,
): RealProfileAnalysisOutput {
  const seasonFallback = input.currentSeason ?? input.selectedSeason
  const seasonMatches = filterSeasonMatches(
    input.loadedMatches,
    input.selectedSeason,
    seasonFallback,
  )
  const acceptLoadedSeasonFallback =
    seasonMatches.length > 0 &&
    !seasonMatches.some(
      (match) => (match.seasonNumber ?? seasonFallback) === input.selectedSeason,
    )
  const analysisEligibility = computeAnalysisEligibility({
    matches: seasonMatches,
    seasonNumber: input.selectedSeason,
    seasonFallback,
    characterKey: null,
    acceptLoadedSeasonFallback,
    scope: 'all',
  })
  const analysisMatches = analysisEligibility.matches
  const recentN = analysisMatches.length
  const recentMatchesBasisLabel =
    recentN > 0 ? profileCharacterStatsBasisLabel(recentN) : null
  const analysisBasisLabel =
    recentN > 0
      ? `최근 경기 분석: 현재 로드된 ${recentN}경기 기준`
      : input.statsDto && input.statsDto.games > 0
        ? '시즌 집계 통계 기준'
        : '최근 경기 데이터 없음'

  const character = buildRealProfileCharacterReports(
    input.statsDto?.characterStats,
    seasonMatches,
  )

  const analysisReport = buildRealModePlayerReport({
    nickname: input.nickname,
    matches: analysisMatches,
    statsDto: input.statsDto,
    basisLabel: recentMatchesBasisLabel ?? SEASON_CHARACTER_STATS_LABEL,
  })
  const playStyleAnalysis = buildRealPlayStyleAnalysisFromProductionAxes({
    axes: input.statsDto?.overallAnalysisAxes,
    overallScore: input.statsDto?.overallGradeV2?.overallPerformanceScore ?? null,
    basisLabel: `${recentMatchesBasisLabel ?? RANK_AGGREGATE_STATS_LABEL} · 6축 분석`,
  })

  return {
    analysisReport,
    analysisCharacterReports: character.reports,
    analysisMatches,
    analysisSeasonMatches: seasonMatches,
    analysisEligibility,
    acceptLoadedSeasonFallback,
    analysisBasisLabel,
    playStyleAnalysis,
    characterStatsSource: character.source,
    characterStatsSourceLabel: character.sourceLabel,
    recentMatchesBasisLabel,
  }
}
