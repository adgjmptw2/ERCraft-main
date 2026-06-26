import { describe, expect, it } from 'vitest'

import { asymmetricMetricAdjustment } from './asymmetricMetricAdjustment.js'

describe('asymmetricMetricAdjustment', () => {
  it.each([
    [40, 43.75],
    [50, 53.75],
    [56.98, 58.985],
    [65, 65],
    [66.63, 66.956],
    [68.55, 69.26],
    [75.78, 77.936],
    [80, 83],
    [84.58, 89.183],
    [90, 95],
    [100, 95],
  ])('adjusts raw %s to %s', (raw, expected) => {
    expect(asymmetricMetricAdjustment(raw)?.adjustedMetricScore).toBeCloseTo(expected, 3)
  })

  it('is continuous at 50, 65, and 80', () => {
    expect(asymmetricMetricAdjustment(50)?.adjustedMetricScore).toBeCloseTo(53.75, 6)
    expect(asymmetricMetricAdjustment(65)?.adjustedMetricScore).toBeCloseTo(65, 6)
    expect(asymmetricMetricAdjustment(80)?.adjustedMetricScore).toBeCloseTo(83, 6)
  })

  it('keeps the final adjusted score within 30 and 95', () => {
    expect(asymmetricMetricAdjustment(-100)?.adjustedMetricScore).toBe(30)
    expect(asymmetricMetricAdjustment(150)?.adjustedMetricScore).toBe(95)
  })
})
