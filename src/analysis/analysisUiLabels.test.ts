import { describe, expect, it } from 'vitest'

import {
  ANALYSIS_UI_SECTIONS,
  getConfidenceLabel,
  getStatusBadgeLabel,
  shouldShowMetricInSection,
  SUMMARY_CARD_METRIC_IDS,
} from '@/analysis/analysisUiLabels'

describe('analysisUiLabels', () => {
  it('summary card id 중복 없음', () => {
    expect(new Set(SUMMARY_CARD_METRIC_IDS).size).toBe(SUMMARY_CARD_METRIC_IDS.length)
  })

  it('confidence 라벨', () => {
    expect(getConfidenceLabel('high')).toBe('신뢰도 높음')
    expect(getConfidenceLabel('insufficient')).toBe('표본 부족')
  })

  it('status badge 라벨', () => {
    expect(getStatusBadgeLabel('ready')).toBeNull()
    expect(getStatusBadgeLabel('future', 'requiresMatchDetail')).toBe('일부 데이터')
    expect(getStatusBadgeLabel('future', 'requiresDataset')).toBe('데이터 축적 후')
  })

  it('섹션 표시 규칙', () => {
    expect(shouldShowMetricInSection('ready', false)).toBe(true)
    expect(shouldShowMetricInSection('unavailable', false)).toBe(false)
    expect(shouldShowMetricInSection('future', true)).toBe(true)
    expect(shouldShowMetricInSection('future', false)).toBe(false)
  })

  it('UI 섹션 id 중복 없음', () => {
    const ids = ANALYSIS_UI_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
