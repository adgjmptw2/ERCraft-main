import { describe, expect, it } from 'vitest'

import {
  ANALYSIS_METRIC_CATALOG,
  assertCatalogIntegrity,
  getCatalogMetricIds,
  getFutureAvailabilityMetrics,
  getPrimaryMetrics,
} from '@/analysis/metricCatalog'

describe('metricCatalog', () => {
  it('id 중복 없음', () => {
    expect(() => assertCatalogIntegrity()).not.toThrow()
    const ids = getCatalogMetricIds()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('requiresDataset 지표는 populationDataset 플래그', () => {
    const datasetMetrics = ANALYSIS_METRIC_CATALOG.filter(
      (m) => m.availability === 'requiresDataset',
    )
    expect(datasetMetrics.length).toBeGreaterThan(0)
    for (const metric of datasetMetrics) {
      expect(metric.requiresPopulationDataset).toBe(true)
      expect(metric.hidden).toBe(true)
    }
  })

  it('requiresMatchDetail 지표는 teamDetail 플래그', () => {
    const teamMetrics = ANALYSIS_METRIC_CATALOG.filter(
      (m) => m.availability === 'requiresMatchDetail',
    )
    expect(teamMetrics.length).toBeGreaterThan(0)
    for (const metric of teamMetrics) {
      expect(metric.requiresTeamDetail).toBe(true)
      expect(metric.category).toBe('team')
    }
  })

  it('평균 어시는 primary가 아님', () => {
    const assists = ANALYSIS_METRIC_CATALOG.find((m) => m.id === 'avgAssists')
    expect(assists?.isPrimary).toBe(false)
    const primaryIds = getPrimaryMetrics().map((m) => m.id)
    expect(primaryIds).not.toContain('avgAssists')
  })

  it('future availability 목록에 팀·백분위 포함', () => {
    const future = getFutureAvailabilityMetrics()
    const ids = future.map((m) => m.id)
    expect(ids).toContain('teamDamageShare')
    expect(ids).toContain('populationPercentile')
    expect(ids).toContain('sssGrade')
  })

  it('역할 적합도는 experimental + hidden', () => {
    const roleFit = ANALYSIS_METRIC_CATALOG.find((m) => m.id === 'roleFitScore')
    expect(roleFit?.experimental).toBe(true)
    expect(roleFit?.hidden).toBe(true)
  })
})
