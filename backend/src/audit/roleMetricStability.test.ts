import { describe, expect, it } from 'vitest'

import {
  computeTankingEfficiencyValue,
  createSeededRng,
  runMetricBootstrap,
  runTrainValidationStability,
} from './roleMetricStability.js'
import { ROLE_METRIC_STABILITY_CONFIG } from './roleMetricStabilityConfig.js'

describe('roleMetricStability', () => {
  it('bootstrap 500회 이상 실행', () => {
    const values = Array.from({ length: 120 }, (_, index) => 1000 + index * 50)
    const result = runMetricBootstrap(values, 'provisional', {
      zeroHeavy: false,
      positiveCount: values.length,
      seed: 42,
    })
    expect(result.iterations).toBeGreaterThanOrEqual(500)
  })

  it('고정 seed 재현성', () => {
    const values = Array.from({ length: 80 }, (_, index) => 500 + index * 10)
    const a = runMetricBootstrap(values, 'provisional', {
      zeroHeavy: false,
      positiveCount: values.length,
      seed: 99,
    })
    const b = runMetricBootstrap(values, 'provisional', {
      zeroHeavy: false,
      positiveCount: values.length,
      seed: 99,
    })
    expect(a.baselineMean).toBe(b.baselineMean)
    expect(a.upperAnchorMean).toBe(b.upperAnchorMean)
  })

  it('deaths=0 tankingEfficiency', () => {
    expect(computeTankingEfficiencyValue(12000, 0)).toBe(12000)
  })

  it('deaths=null 제외', () => {
    expect(computeTankingEfficiencyValue(12000, null)).toBeNull()
  })

  it('validation n<30이면 unstable', () => {
    const train = Array.from({ length: 100 }, (_, index) => index + 1)
    const validation = Array.from({ length: 10 }, (_, index) => index + 1)
    const result = runTrainValidationStability(train, validation)
    expect(result.stable).toBe(false)
    expect(result.failureReasons).toContain('validation-sample-insufficient')
  })

  it('zero-heavy positive anchor rate fallback', () => {
    const values = [...Array.from({ length: 40 }, () => 0), ...Array.from({ length: 20 }, () => 500)]
    const result = runMetricBootstrap(values, 'provisional', {
      zeroHeavy: true,
      positiveCount: 20,
      config: {
        ...ROLE_METRIC_STABILITY_CONFIG,
        bootstrapSeed: 391108,
      },
    })
    expect(result.positiveAnchorRate).toBeGreaterThan(0)
  })

  it('seeded rng deterministic', () => {
    const a = createSeededRng(123)()
    const b = createSeededRng(123)()
    expect(a).toBe(b)
  })
})
