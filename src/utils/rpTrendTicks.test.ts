import { describe, expect, it } from 'vitest'

import { computeYAxisTicks } from '@/utils/rpTrendTicks'

describe('computeYAxisTicks', () => {
  it('좁은 RP 범위에서 4~5개 tick', () => {
    const { ticks } = computeYAxisTicks(2342, 2420)
    expect(ticks.length).toBeGreaterThanOrEqual(4)
    expect(ticks.length).toBeLessThanOrEqual(5)
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true)
  })

  it('2000대 범위 tick 예시', () => {
    const { ticks } = computeYAxisTicks(2000, 2400)
    expect(ticks[0]).toBeLessThanOrEqual(2000)
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(2400)
  })

  it('단일값에도 안전', () => {
    const { ticks, domainMin, domainMax } = computeYAxisTicks(2200, 2200)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(domainMin).toBeLessThanOrEqual(2200)
    expect(domainMax).toBeGreaterThanOrEqual(2200)
  })
})
