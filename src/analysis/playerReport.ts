import type { MatchSummary } from '@/types/match'
import {
  buildFeedbackFromReport,
  buildSummaryFromMetrics,
  computePlayerMetrics,
  pickBestCharacter,
  splitStrengthsWeaknesses,
} from '@/analysis/feedbackRules'
import { calculatePercentileRank, gradeFromPercentile, mean } from '@/analysis/percentile'
import type {
  AnalysisGrade,
  AnalysisMetricKey,
  BuildPlayerAnalysisReportParams,
  MetricComparison,
  MetricDirection,
  PlayerAnalysisReport,
  PlayerMetricSnapshot,
} from '@/analysis/types'

const MIN_PLAYER_MATCHES_DEFAULT = 3
const MIN_POPULATION_DEFAULT = 2

interface MetricDef {
  key: AnalysisMetricKey
  label: string
  direction: MetricDirection
  description: string
  pick: (m: PlayerMetricSnapshot) => number
}

const METRIC_DEFS: MetricDef[] = [
  {
    key: 'avgPlacement',
    label: '평균 순위',
    direction: 'lower-better',
    description: 'MatchSummary.placement 평균',
    pick: (m) => m.avgPlacement,
  },
  {
    key: 'avgKills',
    label: '평균 킬',
    direction: 'higher-better',
    description: 'MatchSummary.kills 평균',
    pick: (m) => m.avgKills,
  },
  {
    key: 'avgAssists',
    label: '평균 어시스트',
    direction: 'higher-better',
    description: 'MatchSummary.assists 평균',
    pick: (m) => m.avgAssists,
  },
  {
    key: 'kda',
    label: 'KDA',
    direction: 'higher-better',
    description: '(kills+assists)/deaths, deaths=0이면 kills+assists',
    pick: (m) => m.kda,
  },
  {
    key: 'top3Rate',
    label: '상위 3위 비율',
    direction: 'higher-better',
    description: 'placement ≤ 3 경기 비율(%)',
    pick: (m) => m.top3Rate,
  },
  {
    key: 'winRate',
    label: '승리 비율',
    direction: 'higher-better',
    description: 'MatchSummary.victory 비율(%)',
    pick: (m) => m.winRate,
  },
]

function insufficientReport(
  params: BuildPlayerAnalysisReportParams,
  reason: string,
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
    sampleSize: params.populationMetrics.length,
    baselineLabel: params.baselineLabel ?? '데모 평균',
    playerMatchCount: params.playerMatches.length,
    bestCharacter: null,
  }
}

function buildMetricComparison(
  def: MetricDef,
  playerSnapshot: PlayerMetricSnapshot,
  population: PlayerMetricSnapshot[],
): MetricComparison {
  const playerValue = def.pick(playerSnapshot)
  const populationValues = population.map((p) => def.pick(p))
  const populationMean = mean(populationValues)
  const higherIsBetter = def.direction === 'higher-better'
  const percentile = calculatePercentileRank({
    value: playerValue,
    populationValues,
    higherIsBetter,
  })
  const grade: AnalysisGrade | null =
    percentile != null ? gradeFromPercentile(percentile) : null

  return {
    key: def.key,
    label: def.label,
    direction: def.direction,
    playerValue,
    populationMean,
    percentile,
    grade,
    description: def.description,
  }
}

function computeOverallGrade(metrics: MetricComparison[]): {
  grade: AnalysisGrade | null
  percentile: number | null
} {
  const valid = metrics.filter((m) => m.percentile != null)
  if (valid.length < 2) return { grade: null, percentile: null }

  const avg =
    valid.reduce((s, m) => s + (m.percentile ?? 0), 0) / valid.length
  return { grade: gradeFromPercentile(avg), percentile: Math.round(avg * 10) / 10 }
}

export function buildPlayerAnalysisReport(
  params: BuildPlayerAnalysisReportParams,
): PlayerAnalysisReport {
  const minPlayer = params.minPlayerMatches ?? MIN_PLAYER_MATCHES_DEFAULT
  const minPop = params.minPopulationSize ?? MIN_POPULATION_DEFAULT
  const baselineLabel = params.baselineLabel ?? '데모 평균'

  if (params.playerMatches.length < minPlayer) {
    return insufficientReport(
      params,
      '분석할 최근 매치가 부족합니다. (샘플 기준 3경기 이상 필요)',
    )
  }

  const playerSnapshot = computePlayerMetrics(params.playerMatches)
  if (!playerSnapshot) {
    return insufficientReport(params, '매치 데이터를 읽을 수 없습니다.')
  }

  const population = params.populationMetrics.filter((p) => p.matchCount >= minPlayer)
  if (population.length < minPop) {
    return insufficientReport(params, '비교할 샘플 플레이어 데이터가 부족합니다.')
  }

  const metrics = METRIC_DEFS.map((def) =>
    buildMetricComparison(def, playerSnapshot, population),
  )

  const { grade: overallGrade, percentile: overallPercentile } = computeOverallGrade(metrics)
  const bestCharacter = pickBestCharacter(params.playerMatches)

  const draft: PlayerAnalysisReport = {
    status: 'ok',
    overallGrade,
    overallPerformanceScore: overallPercentile,
    overallScoreSource: 'legacy-profile-analysis',
    gradedCharacterCount: 0,
    weightedMatchCount: params.playerMatches.length,
    confidenceStatus: overallPercentile != null ? 'ready' : 'unavailable',
    overallPercentile,
    summary: buildSummaryFromMetrics(metrics, overallGrade),
    metrics: metrics.slice(0, 5),
    strengths: [],
    weaknesses: [],
    feedbackItems: [],
    sampleSize: population.length,
    baselineLabel,
    playerMatchCount: params.playerMatches.length,
    bestCharacter,
  }

  const feedbackItems = buildFeedbackFromReport(draft)
  const { strengths, weaknesses } = splitStrengthsWeaknesses(feedbackItems)

  return {
    ...draft,
    feedbackItems,
    strengths,
    weaknesses,
  }
}

export function buildPopulationMetricsFromMatches(
  matches: MatchSummary[],
  minMatches = MIN_PLAYER_MATCHES_DEFAULT,
): PlayerMetricSnapshot[] {
  const byUser = new Map<number, MatchSummary[]>()
  for (const m of matches) {
    const list = byUser.get(m.userNum) ?? []
    list.push(m)
    byUser.set(m.userNum, list)
  }

  const result: PlayerMetricSnapshot[] = []
  for (const userMatches of byUser.values()) {
    if (userMatches.length < minMatches) continue
    const snap = computePlayerMetrics(userMatches)
    if (snap) result.push(snap)
  }
  return result
}
