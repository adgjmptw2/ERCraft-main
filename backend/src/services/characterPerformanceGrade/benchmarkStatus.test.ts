import { afterEach, describe, expect, it } from 'vitest'

import { getCharacterGradeBenchmarkStatus } from './benchmarkStatus.js'
import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
} from './config.js'

describe('benchmarkStatus', () => {
  afterEach(() => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
  })

  it('production default exposes fixed-v1 metadata and supported modes', () => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE

    const status = getCharacterGradeBenchmarkStatus()

    expect(status.activeSource).toBe('fixed-v1')
    expect(status.benchmarkVersion).toBe(CHARACTER_GRADE_BENCHMARK_VERSION)
    expect(status.metricPresetVersion).toBe(CHARACTER_GRADE_METRIC_PRESET_VERSION)
    expect(status.supportedModes).toEqual(['rank'])
    expect(status.unsupportedModes).toContain('cobalt')
    expect(status.aggregateGradeVersion).toBe('aggregate-grade-calibration.v1')
    expect(status.characterAggregateGradeVersion).toBe('character-aggregate-grade.v5-robust10')
    expect(status.overallAggregateGradeVersion).toBe('overall-aggregate-grade.v5-dtg1')
    expect(status.aggregateGradeCutVersion).toBe('aggregate-grade-shared-fine-cuts.v1')
    expect(status.aggregateShrinkVersion).toBe('aggregate-shrink-k1-10robust.v1')
    expect(status.aggregateShrinkK).toBe(1)
    expect(status.placementAdjustmentVersion).toBe('placement-adjustment.v2')
    expect(status.live.roleMetrics).toBe('stable')
    expect(status.live.combatMetrics).toBe('stable')
  })

  it('unsupported source does not fall back to experimental-local', () => {
    process.env.CHARACTER_GRADE_BENCHMARK_SOURCE = 'bad-local-value'

    const status = getCharacterGradeBenchmarkStatus()

    expect(status.activeSource).toBe('fixed-v1')
    expect(status.configuredSource).toBe('bad-local-value')
    expect(status.sourceValid).toBe(false)
    expect(status.sourceReason).toBe('unsupported-value')
    expect(status.live.roleMetrics).toBe('stable')
    expect(status.live.combatMetrics).toBe('stable')
  })
})
