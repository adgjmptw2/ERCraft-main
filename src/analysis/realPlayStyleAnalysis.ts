import {
  ANALYSIS_AXES,
  ANALYSIS_AXIS_LABELS,
  PLAYER_ROLE_LABELS,
  type AxisScores,
  type PlayStyleRole,
  type PlayerPlayStyleAnalysis,
  type RoleFitScores,
} from '@/analysis/playStyleTypes'
import type { MatchSummary } from '@/types/match'
import type {
  ProductionAnalysisAxesDTO,
  ProductionAnalysisAxisComponentDTO,
  ProductionAnalysisAxisRowDTO,
} from '@/types/player'

const MIN_READY_AXES = 3
const REFERENCE_SCORE = 65

const ROLE_LABEL_TO_PLAY_STYLE: Record<string, PlayStyleRole> = {
  '평타 딜러': 'basicAttackDealer',
  '스증 딜러': 'skillAmpDealer',
  '평타 브루저': 'bruiser',
  '스증 브루저': 'bruiser',
  탱커: 'tank',
  서포터: 'support',
  암살자: 'assassin',
}

const ROLE_INSIGHT_COPY: Record<string, string> = {
  탱커: '탱커 역할에서 생존·시야·교전 기여를 중심으로 분석했어요.',
  서포터: '서포터 역할에서 시야·지원·교전 기여를 중심으로 분석했어요.',
  '평타 딜러': '평타 딜러 역할에서 교전·운영·마무리 기여를 중심으로 분석했어요.',
  '스증 딜러': '스증 딜러 역할에서 교전·운영·마무리 기여를 중심으로 분석했어요.',
  '평타 브루저': '브루저 역할에서 생존·교전·운영 기여를 중심으로 분석했어요.',
  '스증 브루저': '브루저 역할에서 생존·교전·운영 기여를 중심으로 분석했어요.',
  암살자: '암살자 역할에서 교전·운영·마무리 기여를 중심으로 분석했어요.',
}

function isFiniteScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

function insufficient(sampleSize: number, basisLabel: string, reason: string): PlayerPlayStyleAnalysis {
  return {
    status: 'insufficient',
    sampleSize,
    axisScores: {},
    tierAverageAxes: {},
    roleFitScores: {},
    primaryRole: null,
    secondaryRole: null,
    roleConfidence: 'low',
    roleReasonSummary: reason,
    unavailableMetrics: [],
    overallScore: null,
    strengths: [],
    improvements: [],
    comment: reason,
    chartData: [],
    axisDetails: [],
    basisLabel,
  }
}

function resolveRole(roleLabel: string | null | undefined): PlayStyleRole | null {
  if (!roleLabel) return null
  return ROLE_LABEL_TO_PLAY_STYLE[roleLabel] ?? null
}

function roleFitFromPrimary(primaryRole: PlayStyleRole | null, axisScores: AxisScores): RoleFitScores {
  if (!primaryRole) return {}
  const values = Object.values(axisScores).filter(isFiniteScore)
  const score = values.length > 0
    ? clampScore(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null
  return score == null ? {} : { [primaryRole]: score }
}

function formatComponentLine(component: ProductionAnalysisAxisComponentDTO): string {
  const lines: string[] = []
  if (component.score != null) {
    lines.push(`${component.label} ${component.score.toFixed(1)}점`)
  }
  if (component.weight != null && component.metric !== 'matchGradeOutcomeScore' && component.metric !== 'matchGradeScore') {
    lines.push(`가중치 ${component.weight.toFixed(0)}%`)
  }
  if (component.ratio != null && component.ratio > 0) {
    lines.push(`기준 대비 ${component.ratio.toFixed(2)}배`)
  }
  return lines.join('\n')
}

function componentSummary(axis: ProductionAnalysisAxisRowDTO): string {
  if (axis.components.length === 0) return '데이터 없음'
  return axis.components.map(formatComponentLine).join('\n')
}

function resolveFinishDisplay(row: ProductionAnalysisAxisRowDTO): {
  label: string
  description: string
} {
  const sourceMetric = row.components[0]?.metric
  if (sourceMetric === 'matchGradeScore') {
    return {
      label: '경기 성과',
      description: '현재는 경기 종합 성과를 기준으로 표시',
    }
  }
  return {
    label: row.label || ANALYSIS_AXIS_LABELS.finish,
    description: '순위와 경기 결과 성과',
  }
}

function axisKeyword(axis: ProductionAnalysisAxisRowDTO): string {
  const finishMeta = axis.axis === 'finish' ? resolveFinishDisplay(axis) : null
  const sampleNote =
    axis.sampleCount > 0 && axis.sampleCount < axis.components.length
      ? `${axis.sampleCount}경기 기준 · 일부 경기 데이터 제외`
      : axis.sampleCount > 0
        ? `${axis.sampleCount}경기 기준`
        : null
  const parts = [componentSummary(axis)]
  if (finishMeta?.description) parts.push(finishMeta.description)
  if (sampleNote) parts.push(sampleNote)
  return parts.filter(Boolean).join('\n')
}

function strengthLabel(label: string, score: number): string {
  if (score >= 85) return `${label} 매우 우수`
  if (score >= 75) return `${label} 강점`
  return `${label} 양호`
}

function buildInsights(axisRows: ProductionAnalysisAxisRowDTO[]): {
  strengths: string[]
  improvements: string[]
} {
  const rows = axisRows
    .filter((row) => isFiniteScore(row.score))
    .map((row) => ({ label: row.label, score: row.score ?? 0 }))
    .sort((a, b) => b.score - a.score)

  const strengths = rows
    .filter((row) => row.score >= 75)
    .slice(0, 2)
    .map((row) => strengthLabel(row.label, row.score))

  const lowest = rows[rows.length - 1]
  const allAboveSixty = rows.every((row) => row.score >= 60)

  if (allAboveSixty) {
    const improvements = ['뚜렷한 약점 없음']
    if (lowest && lowest.score < 75) {
      improvements.push(`${lowest.label} 기여를 높이면 더 좋은 성과를 기대할 수 있어요.`)
    }
    return { strengths, improvements }
  }

  const improvements = rows
    .filter((row) => row.score < 60)
    .slice(-2)
    .reverse()
    .map((row) =>
      row.score < 50 ? `${row.label} 보완 필요` : `${row.label} 개선 여지`,
    )

  return { strengths, improvements }
}

function buildInsightComment(
  axisRows: ProductionAnalysisAxisRowDTO[],
  roleLabel: string | null,
): string {
  const sorted = axisRows
    .filter((row) => isFiniteScore(row.score))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const top = sorted.slice(0, 2).map((row) => row.label)
  const weak = sorted.filter((row) => (row.score ?? 0) < 65).slice(-1)[0]

  if (roleLabel && top.length >= 2) {
    const tail = weak
      ? `${weak.label}은 기준보다 조금 낮아요.`
      : '전반적으로 고른 플레이를 보여요.'
    return `${roleLabel} 역할에서 ${top.join('과 ')}이 강점이며, ${tail}`
  }

  if (roleLabel && ROLE_INSIGHT_COPY[roleLabel]) {
    return ROLE_INSIGHT_COPY[roleLabel]
  }

  return '최근 랭크 기록을 역할 기준으로 분석했어요.'
}

export function buildRealPlayStyleAnalysisFromProductionAxes(params: {
  axes: ProductionAnalysisAxesDTO | null | undefined
  overallScore?: number | null
  primaryGradeRole?: string | null
  basisLabel?: string
}): PlayerPlayStyleAnalysis {
  const basisLabel = params.basisLabel ?? '최근 랭크 경기'
  const axes = params.axes
  if (!axes || axes.sampleCount <= 0) {
    return insufficient(0, basisLabel, '분석할 최근 랭크 경기가 아직 없어요.')
  }

  const axisRows = ANALYSIS_AXES.map((axis) => axes.axes.find((row) => row.axis === axis))
    .filter((row): row is ProductionAnalysisAxisRowDTO => row != null)
  const readyRows = axisRows.filter((row) => isFiniteScore(row.score))

  if (readyRows.length < MIN_READY_AXES) {
    return insufficient(
      axes.sampleCount,
      basisLabel,
      '분석에 필요한 경기 수가 아직 부족해요.',
    )
  }

  const axisScores: AxisScores = {}
  for (const row of readyRows) {
    axisScores[row.axis] = clampScore(row.score ?? 0)
  }

  const chartData = readyRows.map((row) => {
    const finishMeta = row.axis === 'finish' ? resolveFinishDisplay(row) : null
    return {
        subject: finishMeta?.label ?? (row.label || ANALYSIS_AXIS_LABELS[row.axis]),
      axis: row.axis,
      value: clampScore(row.score ?? 0),
      tierAvg: REFERENCE_SCORE,
      fullMark: 100,
    }
  })

  const primaryRole = resolveRole(params.primaryGradeRole)
  const roleFitScores = roleFitFromPrimary(primaryRole, axisScores)
  const insights = buildInsights(readyRows)
  const unavailableMetrics = axisRows
    .filter((row) => row.status === 'unavailable' || !isFiniteScore(row.score))
    .map((row) => row.label)

  const overallScore = isFiniteScore(params.overallScore)
    ? clampScore(params.overallScore)
    : null

  const roleLabel =
    primaryRole && primaryRole !== 'dealer'
      ? PLAYER_ROLE_LABELS[primaryRole]
      : params.primaryGradeRole ?? null
  const roleReasonSummary = roleLabel
    ? ROLE_INSIGHT_COPY[roleLabel] ?? `${roleLabel} 역할 기준으로 분석했어요.`
    : '최근 랭크 기록을 역할 기준으로 분석했어요.'

  return {
    status: 'ok',
    sampleSize: axes.sampleCount,
    axisScores,
    tierAverageAxes: {},
    roleFitScores,
    primaryRole,
    secondaryRole: null,
    roleConfidence: primaryRole ? 'medium' : 'low',
    roleReasonSummary,
    unavailableMetrics,
    overallScore,
    strengths: insights.strengths,
    improvements: insights.improvements,
    comment: buildInsightComment(readyRows, roleLabel),
    chartData,
    axisDetails: axisRows,
    basisLabel,
  }
}

export function buildRealPlayStyleAnalysis(
  _matches: ReadonlyArray<MatchSummary>,
): PlayerPlayStyleAnalysis {
  return insufficient(0, '최근 랭크 경기', '분석할 최근 랭크 경기가 아직 없어요.')
}

export { axisKeyword as productionAnalysisAxisKeyword }
