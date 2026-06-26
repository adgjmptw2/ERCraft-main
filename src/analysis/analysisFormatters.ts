import type { AnalysisMetricValueType } from '@/analysis/metricTypes'

export const FORMAT_EMPTY = '데이터 부족'
export const FORMAT_SAMPLE_INSUFFICIENT = '표본 부족'
export const FORMAT_FUTURE_MATCH_DETAIL = '상세 경기 데이터 필요'
export const FORMAT_FUTURE_DATASET = '데이터 축적 후 제공'

export function isSafeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatAnalysisPercent(value: unknown, digits = 1): string {
  if (!isSafeNumber(value)) return FORMAT_EMPTY
  return `${value.toFixed(digits)}%`
}

export function formatAnalysisDecimal(value: unknown, digits = 2): string {
  if (!isSafeNumber(value)) return FORMAT_EMPTY
  return value.toFixed(digits)
}

/** 분석 점수·축 점수 등 UI 표시용 — 기본 소수 1자리 */
export function formatAnalysisScore(value: unknown, digits = 1): string {
  return formatAnalysisDecimal(value, digits)
}

export function formatAnalysisCount(value: unknown): string {
  if (!isSafeNumber(value)) return FORMAT_EMPTY
  return Math.round(value).toLocaleString('ko-KR')
}

/** 프로젝트 공통: 분:초 (예: 15:32) */
export function formatAnalysisDuration(seconds: unknown): string {
  if (!isSafeNumber(seconds)) return FORMAT_EMPTY
  const min = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function formatMetricByType(
  value: unknown,
  valueType: AnalysisMetricValueType,
): string {
  if (value == null) return FORMAT_EMPTY
  if (valueType === 'text') return String(value)
  if (!isSafeNumber(value)) return FORMAT_EMPTY

  switch (valueType) {
    case 'percent':
      return formatAnalysisPercent(value)
    case 'time':
      return formatAnalysisDuration(value)
    case 'score':
    case 'number':
      return formatAnalysisCount(value)
    default:
      return String(value)
  }
}

/** 백분위·SSS 등급 문자열이 UI에 노출되면 안 됨 */
const FORBIDDEN_DISPLAY_PATTERNS = [
  /SSS/i,
  /\bSS\b/,
  /상위\s*[\d.]+\s*%/,
  /샘플\s*상위/,
  /전체\s*유저/,
  /백분위/,
] as const

export function assertNoForbiddenGradeDisplay(text: string): void {
  for (const pattern of FORBIDDEN_DISPLAY_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`Forbidden analysis display pattern: ${text}`)
    }
  }
}

export function formatStatusMessage(
  status: 'future' | 'unavailable' | 'partial',
  availability: string,
): string {
  if (status === 'partial') return FORMAT_SAMPLE_INSUFFICIENT
  if (availability === 'requiresMatchDetail') return FORMAT_FUTURE_MATCH_DETAIL
  if (availability === 'requiresDataset') return FORMAT_FUTURE_DATASET
  return FORMAT_EMPTY
}
