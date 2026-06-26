import { describe, expect, it } from 'vitest'

import {
  COMBAT_ROLLOUT_SAFETY_CONFIG,
  evaluateExactKeyRolloutSafety,
} from './combatRolloutSafety.js'

describe('combatRolloutSafety', () => {
  it('passes when all thresholds are within limits', () => {
    const result = evaluateExactKeyRolloutSafety({
      groupCount: 40,
      meanScoreDelta: -2,
      meanAbsScoreDelta: 2,
      maxAbsScoreDelta: 4,
      coarseBucketChangeRate: 0.05,
      twoPlusStepChangeRate: 0,
      coarseChangeCount: 2,
    })
    expect(result.blocklistPass).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('blocks on mean abs, max, coarse, and two-plus thresholds', () => {
    expect(
      evaluateExactKeyRolloutSafety({
        groupCount: 40,
        meanScoreDelta: -6,
        meanAbsScoreDelta: 6,
        maxAbsScoreDelta: 4,
        coarseBucketChangeRate: 0,
        twoPlusStepChangeRate: 0,
      }).reasons,
    ).toContain('mean-delta-exceeded')

    expect(
      evaluateExactKeyRolloutSafety({
        groupCount: 40,
        meanScoreDelta: 0,
        meanAbsScoreDelta: 1,
        maxAbsScoreDelta: 11,
        coarseBucketChangeRate: 0,
        twoPlusStepChangeRate: 0,
      }).reasons,
    ).toContain('max-delta-exceeded')

    expect(
      evaluateExactKeyRolloutSafety({
        groupCount: 40,
        meanScoreDelta: 0,
        meanAbsScoreDelta: 1,
        maxAbsScoreDelta: 1,
        coarseBucketChangeRate: 0.2,
        twoPlusStepChangeRate: 0,
      }).reasons,
    ).toContain('coarse-change-rate-exceeded')

    expect(
      evaluateExactKeyRolloutSafety({
        groupCount: 40,
        meanScoreDelta: 0,
        meanAbsScoreDelta: 1,
        maxAbsScoreDelta: 1,
        coarseBucketChangeRate: 0,
        twoPlusStepChangeRate: 0.1,
      }).reasons,
    ).toContain('two-plus-step-rate-exceeded')
  })

  it('flags review-needed for small sample coarse changes', () => {
    const result = evaluateExactKeyRolloutSafety({
      groupCount: 9,
      meanScoreDelta: 0,
      meanAbsScoreDelta: 1,
      maxAbsScoreDelta: 1,
      coarseBucketChangeRate: 0.11,
      twoPlusStepChangeRate: 0,
      coarseChangeCount: 1,
    })
    expect(result.reviewNeeded).toBe(true)
    expect(result.reasons).toContain('review-needed-small-sample-coarse-change')
    expect(result.blocklistPass).toBe(false)
  })

  it('uses shared config thresholds', () => {
    expect(COMBAT_ROLLOUT_SAFETY_CONFIG.maxMeanAbsScoreDelta).toBe(5)
    expect(COMBAT_ROLLOUT_SAFETY_CONFIG.maxAbsScoreDelta).toBe(10)
    expect(COMBAT_ROLLOUT_SAFETY_CONFIG.maxCoarseBucketChangeRate).toBe(0.1)
    expect(COMBAT_ROLLOUT_SAFETY_CONFIG.maxTwoPlusStepChangeRate).toBe(0.05)
  })
})
