import { describe, expect, it } from 'vitest'

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
  isSafeNumber,
} from '@/analysis/analysisFormatters'

describe('analysisFormatters', () => {
  it('NaN/Infinity/null/undefined를 안전하게 처리', () => {
    expect(formatAnalysisPercent(NaN)).toBe(FORMAT_EMPTY)
    expect(formatAnalysisPercent(Infinity)).toBe(FORMAT_EMPTY)
    expect(formatAnalysisPercent(null)).toBe(FORMAT_EMPTY)
    expect(formatAnalysisDecimal(undefined)).toBe(FORMAT_EMPTY)
    expect(formatAnalysisCount(NaN)).toBe(FORMAT_EMPTY)
    expect(formatAnalysisDuration(undefined)).toBe(FORMAT_EMPTY)
    expect(isSafeNumber(NaN)).toBe(false)
  })

  it('정상 값 포맷', () => {
    expect(formatAnalysisPercent(52.34, 1)).toBe('52.3%')
    expect(formatAnalysisDecimal(3.456, 2)).toBe('3.46')
    expect(formatAnalysisCount(12340)).toBe('12,340')
    expect(formatAnalysisDuration(932)).toBe('15:32')
    expect(formatAnalysisScore(16.666666666)).toBe('16.7')
  })

  it('상태 메시지 상수', () => {
    expect(FORMAT_SAMPLE_INSUFFICIENT).toBe('표본 부족')
    expect(FORMAT_FUTURE_MATCH_DETAIL).toBe('상세 경기 데이터 필요')
    expect(FORMAT_FUTURE_DATASET).toBe('데이터 축적 후 제공')
  })

  it('금지 등급/백분위 문자열 감지', () => {
    expect(() => assertNoForbiddenGradeDisplay('SSS')).toThrow()
    expect(() => assertNoForbiddenGradeDisplay('샘플 상위 12%')).toThrow()
    expect(() => assertNoForbiddenGradeDisplay('52.3%')).not.toThrow()
  })
})
