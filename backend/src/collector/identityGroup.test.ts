import { describe, expect, it } from 'vitest'

import { normalizeIdentityNickname } from './identityNickname.js'
import { loadCollectorConfig } from './config.js'
import { createCollectorRunMetrics, finalizeIdentityGroupMetrics, recordIdentityGroupResult } from './metrics.js'

describe('normalizeIdentityNickname', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeIdentityNickname('  GapRi ')).toBe('gapri')
  })

  it('rejects empty and too-short nicknames', () => {
    expect(normalizeIdentityNickname('')).toBeNull()
    expect(normalizeIdentityNickname('a')).toBeNull()
  })
})

describe('identity group metrics', () => {
  it('computes savings and per-group ratios without divide-by-zero', () => {
    const metrics = createCollectorRunMetrics(1000)
    metrics.identityGroup.identityGroupsClaimed = 1
    recordIdentityGroupResult(metrics, 5, {
      nicknameResolveApi: 1,
      nicknameBindingHits: 0,
      nicknameCacheHits: 0,
      verificationPages: 2,
      candidateGameIdsChecked: 40,
      candidatesResolved: 3,
      candidatesMismatch: 1,
      candidatesOutOfWindow: 1,
      candidatesNotFound: 0,
      candidatesAmbiguous: 0,
      candidatesDeferred: 0,
      candidatesAlreadyLinked: 0,
      estimatedApiSaved: 8,
    })
    finalizeIdentityGroupMetrics(metrics)
    expect(metrics.identityGroup.identityApiRequestsSavedEstimate).toBe(8)
    expect(metrics.identityGroup.resolvedCandidatesPerVerificationPage).toBe(1.5)
    expect(metrics.identityGroup.identityApiRequestsPerResolvedCandidate).toBe(1)
    expect(metrics.identityQueueResolved).toBe(3)
  })
})

describe('collector config group defaults', () => {
  it('caps group size at 25', () => {
    const config = loadCollectorConfig()
    expect(config.identityGroupSize).toBeLessThanOrEqual(25)
    expect(config.identityGroupMaxSourceGames).toBeLessThanOrEqual(25)
    expect(config.identityResolveBatchSize).toBeLessThanOrEqual(25)
  })
})
