import { describe, expect, it } from 'vitest'

import {
  computeRelativePerformance,
  normalizeMetricScore,
  robustNormalizeMetricScore,
} from './metrics.js'

describe('robustNormalizeMetricScore', () => {
  it('elite 정상일 때 기존 65/88 anchor 계산', () => {
    expect(
      robustNormalizeMetricScore({
        playerValue: 15,
        tierValue: 5,
        eliteCandidates: [{ tierKey: 'in1000', value: 15, count: 37 }],
        higherBetter: true,
        metricKey: 'averagePlayerKill',
      }).score,
    ).toBe(88)
    expect(
      robustNormalizeMetricScore({
        playerValue: 5,
        tierValue: 5,
        eliteCandidates: [{ tierKey: 'in1000', value: 15, count: 37 }],
        higherBetter: true,
        metricKey: 'averagePlayerKill',
      }).score,
    ).toBe(65)
  })

  it('elite 역전 시 tier-only fallback', () => {
    const result = robustNormalizeMetricScore({
      playerValue: 0.16,
      tierValue: 0.1533,
      eliteCandidates: [{ tierKey: 'in1000', value: 0.1351, count: 37 }],
      higherBetter: true,
      metricKey: 'winRate',
    })
    expect(result.score).not.toBeNull()
    expect(result.mode).toBe('tier-only')
  })

  it('IN1000 역전 후 mithril_plus가 정상 방향이면 대체 anchor 사용', () => {
    const result = robustNormalizeMetricScore({
      playerValue: 0.17,
      tierValue: 0.1533,
      eliteCandidates: [
        { tierKey: 'in1000', value: 0.1351, count: 37 },
        { tierKey: 'mithril_plus', value: 0.1679, count: 399 },
      ],
      higherBetter: true,
      metricKey: 'winRate',
    })
    expect(result.mode).toBe('alternate-elite')
    expect(result.score).toBeGreaterThan(65)
  })

  it('모든 상위 anchor 역전이면 tier-only 공식', () => {
    const result = robustNormalizeMetricScore({
      playerValue: 0.16,
      tierValue: 0.1533,
      eliteCandidates: [
        { tierKey: 'in1000', value: 0.1351, count: 37 },
        { tierKey: 'mithril_plus', value: 0.14, count: 399 },
      ],
      higherBetter: true,
      metricKey: 'winRate',
    })
    expect(result.mode).toBe('tier-only')
    expect(result.score).toBeGreaterThan(65)
  })

  it('작은 elite 간격은 tier-only fallback', () => {
    const result = robustNormalizeMetricScore({
      playerValue: 0.154,
      tierValue: 0.1533,
      eliteCandidates: [{ tierKey: 'in1000', value: 0.15331, count: 100 }],
      higherBetter: true,
      metricKey: 'winRate',
    })
    expect(result.mode).toBe('tier-only')
  })

  it('티어 평균과 같은 값은 65점', () => {
    expect(
      robustNormalizeMetricScore({
        playerValue: 5,
        tierValue: 5,
        eliteCandidates: [{ tierKey: 'in1000', value: 5, count: 100 }],
        higherBetter: true,
        metricKey: 'averagePlayerKill',
      }).score,
    ).toBe(65)
  })

  it('티어 평균보다 낮은 값이 20점까지 급락하지 않음', () => {
    const result = robustNormalizeMetricScore({
      playerValue: 0,
      tierValue: 0.1533,
      eliteCandidates: [{ tierKey: 'in1000', value: 0.2, count: 100 }],
      higherBetter: true,
      metricKey: 'winRate',
    })
    expect(result.score).toBeGreaterThanOrEqual(20)
    expect(result.score!).toBeLessThan(65)
  })

  it('낮을수록 좋은 평균 순위 방향', () => {
    expect(
      robustNormalizeMetricScore({
        playerValue: 2,
        tierValue: 5,
        eliteCandidates: [{ tierKey: 'in1000', value: 2, count: 100 }],
        higherBetter: false,
        metricKey: 'averagePlace',
      }).score,
    ).toBe(88)
  })

  it('normalizeMetricScore 호환 — tier=elite 동일값은 65', () => {
    expect(normalizeMetricScore(5, 5, 5, true)).toBe(65)
  })

  it('relativePerformance 계산', () => {
    expect(computeRelativePerformance(0.2, 0.1533, true)).toBeCloseTo(0.3046, 3)
    expect(computeRelativePerformance(4.2, 4.48, false)).toBeCloseTo(0.0625, 3)
  })
})
