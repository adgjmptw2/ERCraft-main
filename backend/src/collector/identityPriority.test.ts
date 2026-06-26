import { describe, expect, it } from 'vitest'

import { computeIdentityPriority, qualifiesForDeepVerification } from './identityPriority.js'

describe('identity priority', () => {
  it('binding hint가 있으면 우선순위가 높아진다', () => {
    const withBinding = computeIdentityPriority({
      row: { nickname: 'A', sourceGameId: '1', characterNum: 1, priority: 50, attemptCount: 0 },
      context: {
        nicknameOccurrenceCount: 1,
        sourcePlayedAtMs: Date.now(),
        hasBindingHint: true,
        teamLuckResolvable: false,
        sampleSparseBonus: 0,
      },
    })
    const withoutBinding = computeIdentityPriority({
      row: { nickname: 'A', sourceGameId: '1', characterNum: 1, priority: 50, attemptCount: 0 },
      context: {
        nicknameOccurrenceCount: 1,
        sourcePlayedAtMs: Date.now(),
        hasBindingHint: false,
        teamLuckResolvable: false,
        sampleSparseBonus: 0,
      },
    })
    expect(withBinding).toBeLessThan(withoutBinding)
  })

  it('낮은 우선순위 후보는 deep 검증 대상이 아니다', () => {
    expect(qualifiesForDeepVerification(90, 80, true)).toBe(false)
    expect(qualifiesForDeepVerification(70, 80, true)).toBe(true)
  })
})
