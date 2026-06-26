import type {
  ProductionAnalysisAxisComponentDTO,
  ProductionAnalysisAxisRowDTO,
} from '@/types/player'

export interface AnalysisAxisDisplayCopy {
  summary: string
  detail: string
  sampleNote: string | null
}

const LOWER_IS_BETTER_METRICS = new Set(['survival'])

const METRIC_SUBJECT: Record<string, string> = {
  survival: '데스',
  monster: '야생동물 활동',
  vision: '시야 기여',
  damage: '피해',
  combatContribution: '교전 기여',
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function percentFromRatio(ratio: number): number {
  return Math.round(Math.abs((ratio - 1) * 100))
}

function formatSignedPercent(ratio: number): string {
  const pct = Math.round((ratio - 1) * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

function formatHigherBetterPhrase(label: string, ratio: number, allowMultiplier = true): string {
  if (allowMultiplier && ratio >= 1.8) {
    return `${label}이(가) 기준의 ${ratio.toFixed(2)}배예요`
  }
  if (ratio > 1) {
    return `${label}이(가) 기준보다 ${percentFromRatio(ratio)}% 높아요`
  }
  if (ratio < 1) {
    return `${label}이(가) 기준보다 ${percentFromRatio(ratio)}% 낮아요`
  }
  return `${label}이(가) 기준과 비슷해요`
}

function formatLowerBetterFromValues(actual: number, expected: number, subject: string): string {
  if (actual < expected) {
    const pct = Math.round(((expected - actual) / expected) * 100)
    return `평균 ${subject}가 기준보다 ${pct}% 적어요`
  }
  if (actual > expected) {
    const pct = Math.round(((actual - expected) / expected) * 100)
    return `평균 ${subject}가 기준보다 ${pct}% 많아요`
  }
  return `평균 ${subject}가 기준과 비슷해요`
}

function formatComponentRatioPhrase(component: ProductionAnalysisAxisComponentDTO): string | null {
  const label = component.label || METRIC_SUBJECT[component.metric] || component.metric
  const lowerIsBetter = LOWER_IS_BETTER_METRICS.has(component.metric)

  if (
    lowerIsBetter &&
    isFiniteNumber(component.actualValue) &&
    isFiniteNumber(component.expectedValue) &&
    component.expectedValue > 0
  ) {
    return formatLowerBetterFromValues(
      component.actualValue,
      component.expectedValue,
      METRIC_SUBJECT[component.metric] ?? label,
    )
  }

  if (!isFiniteNumber(component.ratio) || component.ratio <= 0) return null

  if (lowerIsBetter) {
    const subject = METRIC_SUBJECT[component.metric] ?? label
    const pct = percentFromRatio(component.ratio)
    if (component.ratio < 1) {
      return `평균 ${subject}가 기준보다 ${pct}% 적어요`
    }
    if (component.ratio > 1) {
      return `평균 ${subject}가 기준보다 ${pct}% 많아요`
    }
    return `평균 ${subject}가 기준과 비슷해요`
  }

  const allowMultiplier = component.metric === 'vision' || component.metric === 'monster'
  return formatHigherBetterPhrase(label, component.ratio, allowMultiplier)
}

function buildCombatSummary(components: ProductionAnalysisAxisComponentDTO[]): string {
  const damage = components.find((row) => row.metric === 'damage')
  const combat = components.find((row) => row.metric === 'combatContribution')
  const parts: string[] = []

  if (damage && isFiniteNumber(damage.ratio) && damage.ratio > 0) {
    parts.push(`피해 ${formatSignedPercent(damage.ratio)}`)
  }
  if (combat && isFiniteNumber(combat.ratio) && combat.ratio > 0) {
    parts.push(`교전 기여 ${formatSignedPercent(combat.ratio)}`)
  }

  if (parts.length > 0) return parts.join(' · ')
  return '교전 데이터를 반영했어요'
}

function buildFinishSummary(axis: ProductionAnalysisAxisRowDTO): string {
  const sourceMetric = axis.components[0]?.metric
  if (sourceMetric === 'matchGradeOutcomeScore') {
    return '순위와 경기 결과가 좋은 편이에요'
  }
  if (sourceMetric === 'matchGradeScore') {
    return '최근 경기 종합 성과를 반영했어요'
  }
  return '최근 경기 성과를 반영했어요'
}

function buildConsistencySummary(score: number | null): string {
  if (!isFiniteNumber(score)) return '경기별 성과 흐름을 반영했어요'
  if (score >= 80) return '경기별 성과가 매우 안정적이에요'
  if (score >= 70) return '경기별 점수 흐름이 안정적인 편이에요'
  if (score >= 60) return '경기마다 약간의 차이가 있어요'
  return '경기별 성과 편차가 큰 편이에요'
}

function buildAxisSummary(axis: ProductionAnalysisAxisRowDTO): string {
  if (axis.components.length === 0) return '데이터가 아직 부족해요'

  if (axis.axis === 'combat') {
    return buildCombatSummary(axis.components)
  }
  if (axis.axis === 'finish') {
    return buildFinishSummary(axis)
  }
  if (axis.axis === 'consistency') {
    return buildConsistencySummary(axis.score)
  }

  const primary = axis.components[0]
  const phrase = formatComponentRatioPhrase(primary)
  if (phrase) return phrase

  if (isFiniteNumber(primary.score)) {
    return `${primary.label} 지표를 반영했어요`
  }
  return '데이터를 반영했어요'
}

function formatDetailMetricLine(component: ProductionAnalysisAxisComponentDTO): string {
  const lines: string[] = []
  if (isFiniteNumber(component.score)) {
    lines.push(`${component.label} ${component.score.toFixed(1)}점`)
  }
  if (isFiniteNumber(component.weight)) {
    lines.push(`가중치 ${component.weight.toFixed(0)}%`)
  }
  if (isFiniteNumber(component.actualValue) && isFiniteNumber(component.expectedValue)) {
    lines.push(`실제 평균 ${component.actualValue.toFixed(2)} · 기준 평균 ${component.expectedValue.toFixed(2)}`)
  }
  if (isFiniteNumber(component.ratio) && component.ratio > 0) {
    lines.push(`기준 대비 ${component.ratio.toFixed(2)}배`)
  }
  return lines.join(' · ')
}

function buildAxisDetail(axis: ProductionAnalysisAxisRowDTO): string {
  if (axis.components.length === 0) return ''
  const lines = axis.components.map(formatDetailMetricLine).filter((line) => line.length > 0)
  if (axis.sampleCount > 0) {
    lines.push(`${axis.sampleCount}경기 데이터`)
  }
  if (axis.status === 'partial') {
    lines.push('일부 경기 제외')
  }
  return lines.join('\n')
}

function buildAxisSampleNote(
  axis: ProductionAnalysisAxisRowDTO,
  totalSampleCount: number,
): string | null {
  if (axis.sampleCount <= 0) return null
  if (axis.sampleCount === totalSampleCount) return null
  if (axis.status === 'partial') {
    return `${axis.sampleCount}경기 데이터 · 일부 경기 제외`
  }
  return `${axis.sampleCount}경기 데이터`
}

export function buildAnalysisAxisDisplayCopy(
  axis: ProductionAnalysisAxisRowDTO,
  totalSampleCount: number,
): AnalysisAxisDisplayCopy {
  return {
    summary: buildAxisSummary(axis),
    detail: buildAxisDetail(axis),
    sampleNote: buildAxisSampleNote(axis, totalSampleCount),
  }
}
