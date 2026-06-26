import { describe, expect, it } from 'vitest'

import { enrichSummaryCardFromProductionAxes } from '@/analysis/analysisSummaryEnrichment'
import type { AnalysisMetricCardModel } from '@/analysis/analysisTabViewModel'
import type { ProductionAnalysisAxesDTO } from '@/types/player'

function summaryCard(id: string, value = '데이터 부족'): AnalysisMetricCardModel {
  return {
    id,
    label: id,
    value,
    size: 'medium',
    status: 'unavailable',
    unavailable: true,
  }
}

const axes: ProductionAnalysisAxesDTO = {
  version: 'production-analysis-axes.v1.1',
  metricPresetVersion: 'character-grade-production',
  scope: 'overall',
  sampleCount: 18,
  aggregationPolicy: 'production-overall-direct-match-mean',
  axes: [
    {
      axis: 'support',
      label: '지원',
      score: 86.2,
      referenceScore: 65,
      status: 'ready',
      sampleCount: 18,
      components: [{
        metric: 'vision',
        label: '시야',
        score: 86.2,
        weight: 100,
        contribution: 86.2,
        actualValue: 47.2,
        expectedValue: 23,
        ratio: 2.05,
      }],
      description: '시야',
    },
    {
      axis: 'macro',
      label: '운영',
      score: 79.3,
      referenceScore: 65,
      status: 'ready',
      sampleCount: 18,
      components: [{
        metric: 'monster',
        label: '야생동물',
        score: 79.3,
        weight: 100,
        contribution: 79.3,
        actualValue: 37.4,
        expectedValue: 28.6,
        ratio: null,
      }],
      description: '야생동물',
    },
  ],
}

describe('analysisSummaryEnrichment', () => {
  it('production component actualValue로 시야·야생동물 요약 카드를 연결', () => {
    const vision = enrichSummaryCardFromProductionAxes(summaryCard('viewContribution'), axes)
    const monster = enrichSummaryCardFromProductionAxes(summaryCard('avgAnimalKills'), axes)

    expect(vision.value).toBe('47.2')
    expect(vision.status).toBe('ready')
    expect(vision.hint).toContain('2.05배')
    expect(monster.value).toBe('37.4')
    expect(monster.status).toBe('ready')
    expect(monster.hint).toContain('28.6')
  })
})
