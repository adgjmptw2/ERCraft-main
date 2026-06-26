import { describe, expect, it } from 'vitest'

import { resolveDamageTimeGlobalMultiplier } from './damageTimeGlobal.js'

function seconds(minutes: number): number {
  return minutes * 60
}

describe('damageTimeGlobal production preset', () => {
  it('keeps legacy multiplier before 8 minutes and from 25 minutes', () => {
    expect(resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(7.9), legacyMultiplier: 0.7 }).multiplier)
      .toBe(0.7)
    expect(resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(25), legacyMultiplier: 1.3 }).multiplier)
      .toBe(1.3)
  })

  it('smoothly blends legacy to global from 8 to 10 minutes', () => {
    const eight = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(8), legacyMultiplier: 0.7 })
    const nine = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(9), legacyMultiplier: 0.7 })
    const ten = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(10), legacyMultiplier: 0.7 })

    expect(eight.multiplier).toBe(0.7)
    expect(nine.multiplier).toBeCloseTo((0.7 + 0.518732) / 2, 6)
    expect(ten.multiplier).toBe(0.518732)
    expect(nine.policy).toBe('blend-legacy-to-global')
    expect(ten.policy).toBe('global')
  })

  it('uses the same global shape for all roles through the shared helper', () => {
    const fifteen = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(15), legacyMultiplier: 0.9 })
    const twenty = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(20), legacyMultiplier: 0.9 })

    expect(fifteen.multiplier).toBe(0.807183)
    expect(twenty.multiplier).toBe(1.079121)
  })

  it('smoothly returns to legacy from 20 to 25 minutes', () => {
    const twenty = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(20), legacyMultiplier: 1.25 })
    const halfway = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(22.5), legacyMultiplier: 1.25 })
    const twentyFive = resolveDamageTimeGlobalMultiplier({ durationSeconds: seconds(25), legacyMultiplier: 1.25 })

    const global225 = (1.079121 + 1.328282) / 2
    expect(twenty.multiplier).toBe(1.079121)
    expect(halfway.multiplier).toBeCloseTo((global225 + 1.25) / 2, 6)
    expect(twentyFive.multiplier).toBe(1.25)
    expect(halfway.policy).toBe('blend-global-to-legacy')
  })
})
