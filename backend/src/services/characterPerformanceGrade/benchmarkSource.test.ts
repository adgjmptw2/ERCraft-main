import { afterEach, describe, expect, it } from 'vitest'

import {
  isExperimentalLocalBenchmarkSourceEnabled,
  resolveCharacterGradeBenchmarkSource,
} from './benchmarkSource.js'

describe('benchmarkSource', () => {
  afterEach(() => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
  })

  it('defaults to fixed-v1 without local live baselines', () => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
    const source = resolveCharacterGradeBenchmarkSource()
    expect(source.effective).toBe('fixed-v1')
    expect(source.liveRoleCombatEnabled).toBe(false)
    expect(isExperimentalLocalBenchmarkSourceEnabled()).toBe(false)
  })

  it('enables local live baselines only for experimental-local', () => {
    process.env.CHARACTER_GRADE_BENCHMARK_SOURCE = 'experimental-local'
    const source = resolveCharacterGradeBenchmarkSource()
    expect(source.effective).toBe('experimental-local')
    expect(source.liveRoleCombatEnabled).toBe(true)
    expect(isExperimentalLocalBenchmarkSourceEnabled()).toBe(true)
  })

  it('does not fall back to local DB baselines for unsupported values', () => {
    const source = resolveCharacterGradeBenchmarkSource('unknown-source')
    expect(source.valid).toBe(false)
    expect(source.effective).toBe('fixed-v1')
    expect(source.liveRoleCombatEnabled).toBe(false)
  })

  it('keeps fixed-v2 safe until immutable artifacts exist', () => {
    const source = resolveCharacterGradeBenchmarkSource('fixed-v2')
    expect(source.effective).toBe('fixed-v1')
    expect(source.reason).toBe('fixed-v2-unavailable')
    expect(source.liveRoleCombatEnabled).toBe(false)
  })
})
