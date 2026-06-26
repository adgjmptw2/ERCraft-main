import { describe, expect, it } from 'vitest'

import { buildAnalysisAxisDisplayCopy } from '@/analysis/analysisAxisCopy'
import type { ProductionAnalysisAxisRowDTO } from '@/types/player'

function axisRow(
  overrides: Partial<ProductionAnalysisAxisRowDTO> & Pick<ProductionAnalysisAxisRowDTO, 'axis'>,
): ProductionAnalysisAxisRowDTO {
  return {
    label: overrides.axis,
    score: 70,
    referenceScore: 65,
    status: 'ready',
    sampleCount: 18,
    components: [],
    description: '',
    ...overrides,
  }
}

describe('buildAnalysisAxisDisplayCopy', () => {
  it('생존 축은 데스 역방향 문구를 사용한다', () => {
    const copy = buildAnalysisAxisDisplayCopy(
      axisRow({
        axis: 'survival',
        label: '생존',
        components: [
          {
            metric: 'survival',
            label: '생존',
            score: 69.3,
            weight: 100,
            contribution: 69.3,
            actualValue: 1.8,
            expectedValue: 2,
            ratio: 0.9,
          },
        ],
      }),
      18,
    )
    expect(copy.summary).toContain('데스가 기준보다')
    expect(copy.summary).not.toContain('배예요')
    expect(copy.detail).toContain('가중치')
    expect(copy.sampleNote).toBeNull()
  })

  it('교전 축은 한 줄로 압축한다', () => {
    const copy = buildAnalysisAxisDisplayCopy(
      axisRow({
        axis: 'combat',
        label: '교전',
        components: [
          {
            metric: 'damage',
            label: '피해',
            score: 70.5,
            weight: 12,
            contribution: 8,
            actualValue: null,
            expectedValue: null,
            ratio: 1.07,
          },
          {
            metric: 'combatContribution',
            label: '교전 기여',
            score: 60.9,
            weight: 35,
            contribution: 21,
            actualValue: null,
            expectedValue: null,
            ratio: 0.87,
          },
        ],
      }),
      18,
    )
    expect(copy.summary).toBe('피해 +7% · 교전 기여 -13%')
    expect(copy.detail).toContain('가중치 12%')
    expect(copy.detail).toContain('가중치 35%')
  })

  it('지원 축은 1.8배 이상일 때 배수 표현을 사용한다', () => {
    const copy = buildAnalysisAxisDisplayCopy(
      axisRow({
        axis: 'support',
        label: '지원',
        components: [
          {
            metric: 'vision',
            label: '시야',
            score: 86.2,
            weight: 100,
            contribution: 86.2,
            actualValue: 205,
            expectedValue: 100,
            ratio: 2.05,
          },
        ],
      }),
      18,
    )
    expect(copy.summary).toContain('2.05배')
  })

  it('표본 수가 전체와 다를 때만 sampleNote를 표시한다', () => {
    const copy = buildAnalysisAxisDisplayCopy(
      axisRow({
        axis: 'macro',
        label: '운영',
        sampleCount: 17,
        status: 'partial',
        components: [
          {
            metric: 'monster',
            label: '야생동물',
            score: 79.3,
            weight: 100,
            contribution: 79.3,
            actualValue: null,
            expectedValue: null,
            ratio: 1.3,
          },
        ],
      }),
      18,
    )
    expect(copy.sampleNote).toContain('17경기')
    expect(copy.sampleNote).toContain('일부 경기 제외')
  })

  it('일관성 축은 점수 구간 문구를 사용한다', () => {
    const copy = buildAnalysisAxisDisplayCopy(
      axisRow({
        axis: 'consistency',
        label: '일관성',
        score: 71.1,
        components: [
          {
            metric: 'consistency',
            label: '경기점수 안정성',
            score: 71.1,
            weight: 100,
            contribution: 71.1,
            actualValue: null,
            expectedValue: null,
            ratio: null,
          },
        ],
      }),
      18,
    )
    expect(copy.summary).toBe('경기별 점수 흐름이 안정적인 편이에요')
  })
})
