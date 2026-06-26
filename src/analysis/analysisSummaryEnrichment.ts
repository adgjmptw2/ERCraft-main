import type {
  ProductionAnalysisAxesDTO,
  ProductionAnalysisAxisComponentDTO,
  TeamPerformanceSummaryDTO,
} from '@/types/player'
import type { MatchSummary } from '@/types/match'
import { formatAnalysisDecimal } from '@/analysis/analysisFormatters'
import type { AnalysisMetricCardModel } from '@/analysis/analysisTabViewModel'

function findAxisComponent(
  axes: ProductionAnalysisAxesDTO | null | undefined,
  axis: 'support' | 'macro',
  metric: 'vision' | 'monster',
): ProductionAnalysisAxisComponentDTO | undefined {
  const row = axes?.axes.find((entry) => entry.axis === axis)
  return row?.components.find((component) => component.metric === metric)
}

function formatBaselineHint(
  _actual: number | null | undefined,
  expected: number | null | undefined,
  ratio: number | null | undefined,
): string | undefined {
  const parts: string[] = []
  if (expected != null) parts.push(`기준 ${formatAnalysisDecimal(expected, 1)}`)
  if (ratio != null && ratio > 0) parts.push(`${ratio.toFixed(2)}배`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

export function enrichSummaryCardFromProductionAxes(
  card: AnalysisMetricCardModel,
  axes: ProductionAnalysisAxesDTO | null | undefined,
): AnalysisMetricCardModel {
  if (card.id === 'viewContribution') {
    const component = findAxisComponent(axes, 'support', 'vision')
    if (component?.actualValue != null) {
      return {
        ...card,
        value: formatAnalysisDecimal(component.actualValue, 1),
        hint: formatBaselineHint(
          component.actualValue,
          component.expectedValue,
          component.ratio,
        )
          ? `평균 시야 기여 · ${formatBaselineHint(component.actualValue, component.expectedValue, component.ratio)}`
          : '평균 시야 기여',
        unavailable: false,
        status: 'ready',
      }
    }
  }

  if (card.id === 'avgAnimalKills') {
    const component = findAxisComponent(axes, 'macro', 'monster')
    if (component?.actualValue != null) {
      return {
        ...card,
        value: formatAnalysisDecimal(component.actualValue, 1),
        hint: component.expectedValue != null
          ? `평균 야생동물 처치 · 기준 ${formatAnalysisDecimal(component.expectedValue, 1)}`
          : '평균 야생동물 처치',
        unavailable: false,
        status: 'ready',
      }
    }
  }

  return card
}

export interface TeamLuckViewModel {
  hasData: boolean
  gradeLabel: string | null
  computedLabel: string | null
  teammatePerformanceLabel: string | null
  carryBurdenLabel: string | null
  emptyMessage: string | null
}

function dominantTeamLuckLabel(
  matches: ReadonlyArray<MatchSummary>,
): string | null {
  const counts = new Map<string, number>()
  for (const match of matches) {
    const label = match.teamPerformance?.teamLuckLabel
    if (!label) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label
      bestCount = count
    }
  }
  return best
}

function teammateGradeFromScore(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= 70) return '좋음'
  if (score >= 55) return '보통'
  if (score >= 40) return '나쁨'
  return '최악'
}

export function buildTeamLuckViewModel(params: {
  matches: ReadonlyArray<MatchSummary>
  summary: TeamPerformanceSummaryDTO | null | undefined
}): TeamLuckViewModel {
  const rankMatches = params.matches.filter((match) => match.gameMode === 'rank')
  const totalCount = rankMatches.length
  const computedMatches = rankMatches.filter((match) => {
    const team = match.teamPerformance
    return (
      team != null &&
      (team.status === 'ready' || team.status === 'partial') &&
      (team.teamLuckLabel != null ||
        team.teammatePerformanceScore != null ||
        team.carryBurdenDelta != null)
    )
  })

  const summary = params.summary
  const computedCount = summary?.sampleSize ?? computedMatches.length
  const gradeLabel =
    dominantTeamLuckLabel(computedMatches) ??
    teammateGradeFromScore(summary?.averageTeammatePerformanceScore)

  const teammatePerformanceLabel =
    summary?.averageTeammatePerformanceScore != null
      ? `팀원 평균 성과 ${summary.averageTeammatePerformanceScore.toFixed(1)}`
      : null

  const carryBurdenLabel =
    summary?.averageCarryBurdenDelta != null
      ? `캐리 부담 ${summary.averageCarryBurdenDelta >= 0 ? '+' : ''}${summary.averageCarryBurdenDelta.toFixed(1)}`
      : null

  const hasData =
    computedCount > 0 &&
    (gradeLabel != null || teammatePerformanceLabel != null || carryBurdenLabel != null)

  if (!hasData) {
    return {
      hasData: false,
      gradeLabel: null,
      computedLabel: null,
      teammatePerformanceLabel: null,
      carryBurdenLabel: null,
      emptyMessage:
        '아직 계산 가능한 팀 데이터가 부족해요. 전적이 추가되면 자동으로 분석됩니다.',
    }
  }

  const readyCount = summary?.readyMatches ?? computedCount
  const computedLabel =
    totalCount > 0
      ? `${totalCount}경기 중 ${readyCount}경기 계산`
      : `${computedCount}경기 계산`

  return {
    hasData: true,
    gradeLabel: gradeLabel ? `팀운 ${gradeLabel}` : null,
    computedLabel,
    teammatePerformanceLabel,
    carryBurdenLabel,
    emptyMessage: null,
  }
}
