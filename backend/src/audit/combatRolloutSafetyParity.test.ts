import { describe, expect, it } from 'vitest'

import { evaluateExactKeyRolloutSafety } from '../services/characterPerformanceGrade/combatRolloutSafety.js'

describe('verify vs audit safety parity', () => {
  it('reproduces J verifier zero-delta bug and shared evaluator catches violations', () => {
    const legacyVerifierDeltas = [0, 0, 0, 0]
    const meanAbsFromVerifier =
      legacyVerifierDeltas.reduce((sum, value) => sum + Math.abs(value), 0) /
      legacyVerifierDeltas.length
    expect(meanAbsFromVerifier).toBe(0)

    const auditPairs = [
      { before: 78.21, after: 72.84, coarseChanged: true },
      { before: 77, after: 66, coarseChanged: true },
    ]
    const meanAbsFromAudit =
      auditPairs.reduce((sum, pair) => sum + Math.abs(pair.after - pair.before), 0) /
      auditPairs.length

    const verifierSafety = evaluateExactKeyRolloutSafety({
      groupCount: legacyVerifierDeltas.length,
      meanScoreDelta: 0,
      meanAbsScoreDelta: meanAbsFromVerifier,
      maxAbsScoreDelta: 0,
      coarseBucketChangeRate: 0,
      twoPlusStepChangeRate: 0,
    })
    const auditSafety = evaluateExactKeyRolloutSafety({
      groupCount: auditPairs.length,
      meanScoreDelta: -5.685,
      meanAbsScoreDelta: meanAbsFromAudit,
      maxAbsScoreDelta: Math.max(...auditPairs.map((pair) => Math.abs(pair.after - pair.before))),
      coarseBucketChangeRate: 1,
      twoPlusStepChangeRate: 0.5,
      coarseChangeCount: 2,
    })

    expect(verifierSafety.blocklistPass).toBe(true)
    expect(auditSafety.blocklistPass).toBe(false)
    expect(auditSafety.reasons.length).toBeGreaterThan(0)
  })
})
