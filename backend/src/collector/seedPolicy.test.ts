import { describe, expect, it } from 'vitest'

import { resolveIdentitySeedLimit, resolveQueueSeedLimit } from './seedPolicy.js'

describe('seedPolicy', () => {
  it('defaults balanced and drain identity seed to 0', () => {
    expect(resolveIdentitySeedLimit('balanced', undefined)).toBe(0)
    expect(resolveIdentitySeedLimit('drain', undefined)).toBe(0)
    expect(resolveIdentitySeedLimit('emergency-drain', undefined)).toBe(0)
  })

  it('allows expansion default seed and explicit CLI override', () => {
    expect(resolveIdentitySeedLimit('expansion', undefined)).toBe(500)
    expect(resolveIdentitySeedLimit('balanced', 100)).toBe(100)
  })

  it('defaults queue seed to 0 outside expansion', () => {
    expect(resolveQueueSeedLimit('balanced', undefined)).toBe(0)
    expect(resolveQueueSeedLimit('expansion', undefined)).toBe(500)
  })
})
