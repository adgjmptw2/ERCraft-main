import { describe, expect, it } from 'vitest'

import {
  calculatePercentileRank,
  clampPercentile,
  gradeFromPercentile,
} from '@/analysis/percentile'

describe('clampPercentile', () => {
  it('0~100 범위로 고정', () => {
    expect(clampPercentile(-5)).toBe(0)
    expect(clampPercentile(105)).toBe(100)
    expect(clampPercentile(50)).toBe(50)
  })
})

describe('calculatePercentileRank', () => {
  const population = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  it('비교군이 비어 있으면 null', () => {
    expect(
      calculatePercentileRank({ value: 5, populationValues: [], higherIsBetter: true }),
    ).toBeNull()
  })

  it('higherIsBetter=true에서 높은 값이 높은 percentile', () => {
    const low = calculatePercentileRank({
      value: 2,
      populationValues: population,
      higherIsBetter: true,
    })
    const high = calculatePercentileRank({
      value: 9,
      populationValues: population,
      higherIsBetter: true,
    })
    expect(low).not.toBeNull()
    expect(high).not.toBeNull()
    expect(high!).toBeGreaterThan(low!)
  })

  it('higherIsBetter=false에서 낮은 값이 높은 percentile', () => {
    const low = calculatePercentileRank({
      value: 2,
      populationValues: population,
      higherIsBetter: false,
    })
    const high = calculatePercentileRank({
      value: 9,
      populationValues: population,
      higherIsBetter: false,
    })
    expect(low!).toBeGreaterThan(high!)
  })

  it('결과는 0~100', () => {
    const p = calculatePercentileRank({
      value: 5,
      populationValues: population,
      higherIsBetter: true,
    })
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(100)
  })
})

describe('gradeFromPercentile', () => {
  it('백분위 구간별 등급', () => {
    expect(gradeFromPercentile(95)).toBe('S')
    expect(gradeFromPercentile(80)).toBe('A')
    expect(gradeFromPercentile(60)).toBe('B')
    expect(gradeFromPercentile(30)).toBe('C')
    expect(gradeFromPercentile(10)).toBe('D')
  })
})
