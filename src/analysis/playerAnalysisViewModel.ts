import {
  assertNoForbiddenGradeDisplay,
  formatAnalysisCount,
  formatAnalysisDecimal,
  formatAnalysisDuration,
  formatAnalysisPercent,
  formatAnalysisScore,
  FORMAT_EMPTY,
  FORMAT_FUTURE_DATASET,
  FORMAT_FUTURE_MATCH_DETAIL,
  FORMAT_SAMPLE_INSUFFICIENT,
  formatStatusMessage,
  isSafeNumber,
} from '@/analysis/analysisFormatters'
import {
  ANALYSIS_METRIC_CATALOG,
  getSectionLabel,
  getMetricDefinition,
  assertCatalogIntegrity,
} from '@/analysis/metricCatalog'
import { deriveMatchSetMetrics } from '@/analysis/playStyleMetrics'
import { roleFitLabel } from '@/analysis/playStyleAnalysis'
import {
  type PlayerPlayStyleAnalysis,
  type PlayStyleRole,
} from '@/analysis/playStyleTypes'
import type {
  AnalysisDataConfidence,
  AnalysisMetricDefinition,
  AnalysisMetricStatus,
  AnalysisMetricTone,
  AnalysisMetricViewModel,
  AnalysisSectionViewModel,
  PlayerAnalysisViewModel,
} from '@/analysis/metricTypes'
import {
  resolveAllCharacterDataConfidence,
  ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE,
} from '@/analysis/analysisEligibility'
import type { PlayerAnalysisReport } from '@/analysis/types'
import type { MatchSummary } from '@/types/match'
import { mean } from '@/analysis/percentile'

const MIN_SAMPLE = 3
const SAMPLE_TARGET = 20

const AXIS_KEYWORDS: Record<string, string> = {
  survival: '생존 안정',
  combat: '교전 영향',
  macro: '운영 효율',
  support: '팀 기여',
  clutch: '마무리 판단',
  finish: '후반 마무리',
  consistency: '흐름 일관',
}

interface MetricResolveContext {
  matches: MatchSummary[]
  derived: ReturnType<typeof deriveMatchSetMetrics>
  report: PlayerAnalysisReport | null
  playStyle: PlayerPlayStyleAnalysis | null
  sampleSize: number
}

function averageField(
  matches: MatchSummary[],
  picker: (match: MatchSummary) => number | null | undefined,
): number | null {
  const values = matches.map(picker).filter((v): v is number => isSafeNumber(v))
  return mean(values)
}

function resolvePersonDamage(match: MatchSummary): number | null {
  if (isSafeNumber(match.damageToPlayers)) return match.damageToPlayers
  if (isSafeNumber(match.playerDamage)) return match.playerDamage
  return null
}

function resolveMetricRawValue(id: string, ctx: MetricResolveContext): number | string | null {
  const { matches, derived, report, playStyle, sampleSize } = ctx

  switch (id) {
    case 'sampleSize':
      return sampleSize
    case 'winRate':
      return derived?.winRate ?? reportMetricValue(report, 'winRate')
    case 'avgPlacement':
      return derived?.avgPlacement ?? reportMetricValue(report, 'avgPlacement')
    case 'top3Rate':
      return derived?.top3Rate ?? reportMetricValue(report, 'top3Rate')
    case 'top2Rate':
      return derived?.top2Rate ?? null
    case 'avgDeaths':
      return derived?.avgDeaths ?? null
    case 'avgSurvivalTime':
      return derived?.avgSurvivalSeconds ?? averageField(matches, (m) => m.gameDuration)
    case 'bottomRate':
      return derived?.bottomRate ?? null
    case 'tkInvolvementRate':
      return derived?.tkInvolvementRate != null ? derived.tkInvolvementRate * 100 : null
    case 'avgPersonDamage':
      return derived?.avgPersonDamage ?? averageField(matches, resolvePersonDamage)
    case 'avgKills':
      return derived?.avgKills ?? reportMetricValue(report, 'avgKills')
    case 'avgDamageTaken':
      return averageField(matches, (m) => (m as MatchSummary & { damageFromPlayer?: number }).damageFromPlayer)
    case 'ccTimeToPlayer':
      return averageField(matches, (m) => (m as MatchSummary & { ccTimeToPlayer?: number }).ccTimeToPlayer)
    case 'avgAssists':
      return derived?.avgAssists ?? null
    case 'kda': {
      if (!derived) return null
      return (derived.avgKills + derived.avgAssists) / Math.max(1, derived.avgDeaths)
    }
    case 'avgAnimalKills':
      return derived?.avgAnimalKills ?? averageField(matches, (m) => m.animalKills)
    case 'avgMonsterDamage':
      return derived?.avgMonsterDamage ?? averageField(matches, (m) => m.monsterDamage)
    case 'avgCreditGained':
      return derived?.itemCompletion ?? averageField(matches, (m) => m.credit)
    case 'avgCreditUsed':
      return averageField(matches, (m) => (m as MatchSummary & { creditUsed?: number }).creditUsed)
    case 'creditPerMinute':
      return derived?.creditEfficiency != null ? derived.creditEfficiency * 60 : null
    case 'useHyperLoop':
      return averageField(matches, (m) => (m as MatchSummary & { useHyperLoop?: number }).useHyperLoop)
    case 'useSecurityConsole':
      return averageField(
        matches,
        (m) => (m as MatchSummary & { useSecurityConsole?: number }).useSecurityConsole,
      )
    case 'viewContribution':
      return derived?.avgVision ?? averageField(matches, (m) => m.visionScore)
    case 'surveillanceCamera':
      return averageField(matches, (m) => {
        const ext = m as MatchSummary & { addSurveillanceCamera?: number; removeSurveillanceCamera?: number }
        const add = ext.addSurveillanceCamera ?? 0
        const remove = ext.removeSurveillanceCamera ?? 0
        return add + remove > 0 ? add + remove : null
      })
    case 'reconDrone':
      return averageField(matches, (m) => (m as MatchSummary & { useReconDrone?: number }).useReconDrone)
    case 'empDrone':
      return averageField(matches, (m) => (m as MatchSummary & { useEmpDrone?: number }).useEmpDrone)
    case 'teamRecover':
      return averageField(matches, (m) => (m as MatchSummary & { teamRecover?: number }).teamRecover)
    case 'protectAbsorb':
      return averageField(matches, (m) => (m as MatchSummary & { protectAbsorb?: number }).protectAbsorb)
    case 'placementStdDev':
      return derived?.placementStdDev ?? null
    case 'halfPlacementGap':
      return derived?.halfPlacementGap ?? null
    case 'lateTransitionDelta':
      return derived?.lateTransitionDelta ?? null
    case 'kdaCoefficientOfVariation':
      return derived?.kdaCoefficientOfVariation ?? null
    case 'analysisScore':
      return playStyle?.overallScore ?? null
    case 'roleTendencyPrimary':
      return playStyle?.primaryRole ? roleFitLabel(playStyle.primaryRole) : null
    case 'roleTendencySecondary':
      return playStyle?.secondaryRole ? roleFitLabel(playStyle.secondaryRole) : null
    case 'roleFitScore': {
      if (!playStyle) return null
      const top = Object.entries(playStyle.roleFitScores)
        .filter((entry): entry is [PlayStyleRole, number] => entry[1] != null)
        .sort((a, b) => b[1] - a[1])[0]
      return top?.[1] ?? null
    }
    default:
      return null
  }
}

function reportMetricValue(report: PlayerAnalysisReport | null, key: string): number | null {
  const metric = report?.metrics.find((m) => m.key === key)
  return isSafeNumber(metric?.playerValue) ? metric.playerValue : null
}

function formatRawValue(
  raw: number | string | null,
  def: AnalysisMetricDefinition,
): string {
  if (raw == null) return FORMAT_EMPTY
  if (def.valueType === 'text') return String(raw)

  switch (def.id) {
    case 'winRate':
    case 'top3Rate':
    case 'top2Rate':
    case 'bottomRate':
    case 'tkInvolvementRate':
      return formatAnalysisPercent(raw, 1)
    case 'avgPlacement':
      return formatAnalysisDecimal(raw, 2)
    case 'avgDeaths':
    case 'placementStdDev':
    case 'halfPlacementGap':
    case 'lateTransitionDelta':
    case 'kdaCoefficientOfVariation':
      return formatAnalysisDecimal(raw, 2)
    case 'creditPerMinute':
    case 'useHyperLoop':
    case 'useSecurityConsole':
    case 'kda':
      return formatAnalysisDecimal(raw, 1)
    case 'avgMonsterDamage':
    case 'avgCreditGained':
    case 'avgCreditUsed':
    case 'avgPersonDamage':
    case 'avgDamageTaken':
      return formatAnalysisCount(raw)
    case 'avgSurvivalTime':
      return formatAnalysisDuration(raw)
    case 'viewContribution':
      return formatAnalysisDecimal(raw, 1)
    case 'avgAnimalKills':
      return formatAnalysisDecimal(raw, 1)
    case 'analysisScore':
    case 'roleFitScore':
      return formatAnalysisScore(raw, 1)
    case 'sampleSize':
      return String(Math.round(Number(raw)))
    default:
      if (def.valueType === 'percent') return formatAnalysisPercent(raw, 1)
      if (def.valueType === 'time') return formatAnalysisDuration(raw)
      if (def.valueType === 'score') return formatAnalysisScore(raw, 1)
      if (def.valueType === 'number') return formatAnalysisDecimal(raw, 1)
      return formatAnalysisScore(raw, 1)
  }
}

function resolveStatus(
  def: AnalysisMetricDefinition,
  raw: number | string | null,
  sampleSize: number,
): AnalysisMetricStatus {
  if (def.availability === 'requiresMatchDetail' || def.availability === 'requiresDataset') {
    return 'future'
  }
  if (def.availability === 'unavailable') return 'unavailable'
  if (def.id === 'sampleSize' && isSafeNumber(raw)) return 'ready'
  if (sampleSize < MIN_SAMPLE) return 'partial'
  if (raw == null) {
    return def.availability === 'derived' || def.availability === 'available' ? 'unavailable' : 'partial'
  }
  return 'ready'
}

function resolveTone(status: AnalysisMetricStatus): AnalysisMetricTone {
  if (status === 'future' || status === 'unavailable') return 'neutral'
  if (status === 'partial') return 'warning'
  return 'neutral'
}

function buildMetricViewModel(
  def: AnalysisMetricDefinition,
  ctx: MetricResolveContext,
): AnalysisMetricViewModel {
  const raw =
    def.availability === 'requiresMatchDetail' || def.availability === 'requiresDataset'
      ? null
      : resolveMetricRawValue(def.id, ctx)

  const status = resolveStatus(def, raw, ctx.sampleSize)
  const tone = resolveTone(status)

  let formattedValue: string
  let helperText: string | undefined

  if (status === 'future') {
    formattedValue =
      def.availability === 'requiresDataset' ? FORMAT_FUTURE_DATASET : FORMAT_FUTURE_MATCH_DETAIL
    helperText = def.description
  } else if (status === 'partial') {
    formattedValue = FORMAT_SAMPLE_INSUFFICIENT
    helperText = `최소 ${MIN_SAMPLE}경기 필요`
  } else if (status === 'unavailable' || raw == null) {
    formattedValue = FORMAT_EMPTY
    helperText = def.sourceHint
  } else {
    formattedValue = formatRawValue(raw, def)
    helperText = def.description
  }

  assertNoForbiddenGradeDisplay(formattedValue)

  return {
    id: def.id,
    label: def.label,
    value: status === 'ready' ? raw : null,
    formattedValue,
    description: def.description,
    category: def.category,
    availability: def.availability,
    status,
    tone,
    helperText,
    isPrimary: def.isPrimary,
  }
}

function buildHeadline(playStyle: PlayerPlayStyleAnalysis | null, sampleSize = 0, minSample = MIN_SAMPLE): string {
  if (!playStyle || playStyle.status !== 'ok') {
    if (sampleSize >= minSample) return '최근 경기 분석'
    return '표본 부족'
  }
  const topAxis = playStyle.chartData
    .map((point) => ({
      label: point.subject,
      score: point.value,
    }))
    .sort((a, b) => b.score - a.score)[0]
  if (!topAxis || topAxis.score <= 0) return '성향 분석 준비 중'
  return `${topAxis.label} 중심 플레이`
}

function buildInsightLine(
  playStyle: PlayerPlayStyleAnalysis | null,
  report: PlayerAnalysisReport | null,
): string {
  if (playStyle?.status === 'ok' && playStyle.comment) {
    if (!playStyle.primaryRole && playStyle.roleReasonSummary === '분석 보류') {
      return `${playStyle.basisLabel} 플레이 경향은 여러 역할군이 비슷해 추정을 보류합니다.`
    }
    return playStyle.comment
  }
  if (report?.summary) return report.summary
  return '최근 경기 기준 룰 기반 요약입니다.'
}

function resolveDataConfidence(
  sampleSize: number,
  policy: 'all-character' | 'default' = 'default',
): AnalysisDataConfidence {
  if (policy === 'all-character') {
    return resolveAllCharacterDataConfidence(sampleSize)
  }
  if (sampleSize < MIN_SAMPLE) return 'insufficient'
  if (sampleSize < SAMPLE_TARGET) return 'medium'
  return 'high'
}

function groupSections(metrics: AnalysisMetricViewModel[]): AnalysisSectionViewModel[] {
  const categories = ['result', 'survival', 'combat', 'macro', 'support', 'consistency', 'team'] as const
  return categories
    .map((category) => ({
      id: category,
      label: getSectionLabel(category),
      metrics: metrics.filter((m) => m.category === category),
    }))
    .filter((section) => section.metrics.length > 0)
}

export interface BuildPlayerAnalysisViewModelParams {
  playStyleAnalysis: PlayerPlayStyleAnalysis | null
  analysisReport: PlayerAnalysisReport | null
  analysisMatches: MatchSummary[]
  basisLabel: string
  /** 개인 분석 표본 — playStyle sampleSize보다 우선 */
  eligibleSampleSize?: number
  /** 전체 캐릭터(20+) vs 특정 캐릭터(3+) 신뢰도 정책 */
  confidencePolicy?: 'all-character' | 'default'
}

export function buildPlayerAnalysisViewModel(
  params: BuildPlayerAnalysisViewModelParams,
): PlayerAnalysisViewModel {
  const {
    playStyleAnalysis,
    analysisReport,
    analysisMatches,
    basisLabel,
    eligibleSampleSize,
    confidencePolicy = 'default',
  } = params

  const playStyleSample =
    playStyleAnalysis?.sampleSize != null && playStyleAnalysis.sampleSize > 0
      ? playStyleAnalysis.sampleSize
      : null
  const sampleSize = eligibleSampleSize ?? playStyleSample ?? analysisMatches.length
  const minSampleForHeadline =
    confidencePolicy === 'all-character' ? ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE : MIN_SAMPLE
  const derived = deriveMatchSetMetrics(analysisMatches)
  const playStyle = playStyleAnalysis?.status === 'ok' ? playStyleAnalysis : null

  const ctx: MetricResolveContext = {
    matches: analysisMatches,
    derived,
    report: analysisReport,
    playStyle,
    sampleSize,
  }

  const visibleDefs = ANALYSIS_METRIC_CATALOG.filter((def) => !def.hidden)
  const allMetrics = visibleDefs.map((def) => buildMetricViewModel(def, ctx))

  const futureMetrics = allMetrics.filter((m) => m.status === 'future')
  const unavailableMetrics = allMetrics.filter((m) => m.status === 'unavailable')
  const displayMetrics = allMetrics.filter(
    (m) => m.status === 'ready' || m.status === 'partial' || m.status === 'unavailable',
  )

  const summaryMetricIds = ['winRate', 'avgPlacement', 'top3Rate', 'tkInvolvementRate', 'sampleSize']
  const summaryMetrics = summaryMetricIds
    .map((id) => allMetrics.find((m) => m.id === id))
    .filter((m): m is AnalysisMetricViewModel => m != null)

  const radarAxes =
    playStyle != null
      ? playStyle.chartData.flatMap((point) => {
          const score = playStyle.axisScores[point.axis] ?? point.value
          if (score == null) return []
          return [
            {
              axis: point.axis,
              label: point.subject,
              score,
              keyword: AXIS_KEYWORDS[point.axis] ?? '플레이 경향',
            },
          ]
        })
      : []

  const chartData =
    playStyle?.chartData.map((point) => ({
      subject: point.subject,
      value: point.value,
      referenceAvg: point.tierAvg,
      fullMark: point.fullMark,
    })) ?? []

  const dataNote =
    playStyle && playStyle.unavailableMetrics.length > 0
      ? `일부 지표(${playStyle.unavailableMetrics.slice(0, 3).join(', ')})는 경기 데이터 부족으로 제외되었습니다.`
      : null

  const estimatedTendency = playStyle?.primaryRole
    ? `추정 역할군: ${roleFitLabel(playStyle.primaryRole)}`
    : null
  const secondaryTendency = playStyle?.secondaryRole
    ? `플레이 경향: ${roleFitLabel(playStyle.secondaryRole)}`
    : null
  const rolePrimaryLabel = playStyle?.primaryRole ? roleFitLabel(playStyle.primaryRole) : null
  const roleSecondaryLabel = playStyle?.secondaryRole ? roleFitLabel(playStyle.secondaryRole) : null

  return {
    sampleSize,
    sampleLabel: basisLabel,
    headline: buildHeadline(playStyle, sampleSize, minSampleForHeadline),
    insightLine: buildInsightLine(playStyle, analysisReport),
    dataConfidence: resolveDataConfidence(sampleSize, confidencePolicy),
    estimatedTendency,
    secondaryTendency,
    rolePrimaryLabel,
    roleSecondaryLabel,
    roleConfidence: playStyle?.roleConfidence ?? null,
    roleReasonSummary: playStyle?.roleReasonSummary ?? null,
    playStyleBasisLabel: playStyle?.basisLabel ?? basisLabel,
    summaryMetrics,
    sections: groupSections(displayMetrics.filter((m) => m.category !== 'team')),
    radarAxes,
    chartData,
    analysisScore: playStyle?.overallScore ?? null,
    futureMetrics,
    unavailableMetrics,
    strengths: playStyle?.strengths ?? [],
    improvements: playStyle?.improvements ?? [],
    dataNote,
  }
}

export { assertCatalogIntegrity, getMetricDefinition, formatStatusMessage }
