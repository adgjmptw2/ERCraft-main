import { describe, expect, it } from 'vitest'

import { getRankTierFromRp } from './rankTier.js'
import { resolveSeasonTierLadder } from './seasonRankTierLadder.js'

describe('seasonRankTierLadder', () => {
  it('S11 미스릴 시작 7600', () => {
    expect(resolveSeasonTierLadder(11).mithrilMinRp).toBe(7600)
    expect(getRankTierFromRp(7599, null, 11).displayLabel).toBe('메테오라이트 1')
    expect(getRankTierFromRp(7600, null, 11).displayLabel).toBe('미스릴')
  })

  it('S7~8 미스릴 시작 7100', () => {
    expect(getRankTierFromRp(7099, null, 7).displayLabel).toBe('메테오라이트')
    expect(getRankTierFromRp(7100, null, 8).displayLabel).toBe('미스릴')
  })

  it('S1~2 미스릴 시작 6000', () => {
    expect(getRankTierFromRp(5999, null, 1).displayLabel).toBe('다이아몬드 1')
    expect(getRankTierFromRp(6000, null, 2).displayLabel).toBe('미스릴')
  })

  it('S7 데미갓 7800+ rank 500', () => {
    expect(getRankTierFromRp(7850, 500, 7).displayLabel).toBe('데미갓')
    expect(getRankTierFromRp(7850, 200, 7).displayLabel).toBe('이터니티')
  })

  it('S10 미스릴 rank 기반 데미/이터', () => {
    expect(getRankTierFromRp(8000, 250, 10).displayLabel).toBe('이터니티')
    expect(getRankTierFromRp(8000, 800, 10).displayLabel).toBe('데미갓')
    expect(getRankTierFromRp(8000, null, 10).displayLabel).toBe('미스릴')
  })

  it('S11 데미갓 최소 RP 8300', () => {
    expect(getRankTierFromRp(8024, 740, 11).displayLabel).toBe('미스릴')
    expect(getRankTierFromRp(8350, 740, 11).displayLabel).toBe('데미갓')
  })
})
