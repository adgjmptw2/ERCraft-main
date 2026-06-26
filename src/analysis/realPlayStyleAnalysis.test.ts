import { describe, expect, it } from 'vitest'

import { buildRealPlayStyleAnalysisFromProductionAxes } from '@/analysis/realPlayStyleAnalysis'
import type { ProductionAnalysisAxesDTO, ProductionAnalysisAxisDTO } from '@/types/player'

interface TestComponent {
  metric: string
  label: string
  score: number
  weight: number
}

function axis(
  key: ProductionAnalysisAxisDTO,
  score: number,
  components: TestComponent[] = [{ metric: key, label: key, score, weight: 100 }],
) {
  return {
    axis: key,
    label: {
      survival: '생존',
      combat: '교전',
      macro: '운영',
      support: '지원',
      finish: '마무리',
      consistency: '일관성',
    }[key],
    score,
    referenceScore: 65 as const,
    status: 'ready' as const,
    sampleCount: 12,
    components: components.map((component) => ({
      contribution: component.score,
      actualValue: null,
      expectedValue: null,
      ratio: null,
      ...component,
    })),
    description: `${key} axis`,
  }
}

function makeAxes(): ProductionAnalysisAxesDTO {
  return {
    version: 'production-analysis-axes.v1.1',
    metricPresetVersion: 'character-grade-production',
    scope: 'character',
    sampleCount: 12,
    aggregationPolicy: 'production-character-robust-weighted-10pct',
    axes: [
      axis('survival', 72),
      axis('combat', 80, [
        { metric: 'damage', label: '피해', score: 78, weight: 36 },
        { metric: 'combatContribution', label: '교전 기여', score: 83, weight: 25 },
      ]),
      axis('macro', 69),
      axis('support', 76),
      axis('finish', 71, [{ metric: 'matchGradeScore', label: '경기 성과', score: 71, weight: 100 }]),
      axis('consistency', 88, [{ metric: 'consistency', label: '경기점수 안정성', score: 88, weight: 100 }]),
    ],
  }
}

describe('buildRealPlayStyleAnalysisFromProductionAxes', () => {
  it('6축 DTO에서 고정 6축 분석을 만든다', () => {
    const report = buildRealPlayStyleAnalysisFromProductionAxes({
      axes: makeAxes(),
      overallScore: 77.4,
      primaryGradeRole: '탱커',
      basisLabel: '일레븐 · 18경기',
    })

    expect(report.status).toBe('ok')
    expect(report.sampleSize).toBe(12)
    expect(report.overallScore).toBe(77.4)
    expect(report.primaryRole).toBe('tank')
    expect(report.chartData.map((row) => row.axis)).toEqual([
      'survival',
      'combat',
      'macro',
      'support',
      'finish',
      'consistency',
    ])
    expect(report.chartData.find((row) => row.axis === 'finish')?.subject).toBe('경기 성과')
    expect(report.chartData.every((row) => row.tierAvg === 65 && row.fullMark === 100)).toBe(true)
    expect(report.axisDetails?.find((row) => row.axis === 'combat')?.components.map((row) => row.metric)).toEqual([
      'damage',
      'combatContribution',
    ])
    expect(report.comment).not.toMatch(/production|evidence/i)
  })

  it('분석 데이터가 없으면 insufficient가 된다', () => {
    const report = buildRealPlayStyleAnalysisFromProductionAxes({
      axes: null,
      basisLabel: '최근 랭크 경기',
    })

    expect(report.status).toBe('insufficient')
    expect(report.chartData).toEqual([])
    expect(report.comment).toContain('분석할 최근 랭크 경기')
  })

  it('부분 누락 축은 unavailableMetrics로 보존한다', () => {
    const axes = makeAxes()
    axes.axes = axes.axes.map((row) =>
      row.axis === 'support'
        ? { ...row, score: null, status: 'unavailable' as const, components: [] }
        : row,
    )
    const report = buildRealPlayStyleAnalysisFromProductionAxes({ axes })

    expect(report.status).toBe('ok')
    expect(report.chartData.map((row) => row.axis)).not.toContain('support')
    expect(report.unavailableMetrics).toContain('지원')
  })

  it('60 이상 축은 보완점으로 분류하지 않는다', () => {
    const axes = makeAxes()
    axes.axes = axes.axes.map((row) =>
      row.axis === 'survival' ? { ...row, score: 69.3 } : row,
    )
    const report = buildRealPlayStyleAnalysisFromProductionAxes({ axes })
    expect(report.improvements.some((item) => item.includes('생존 보완'))).toBe(false)
  })
})
