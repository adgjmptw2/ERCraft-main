import { describe, expect, it } from 'vitest'

import { getRankTierFromRp, normalizeRankTier } from '@/utils/rankTierFromRp'

describe('rankTierFromRp (frontend fallback)', () => {
  it('6천점대 프로필이 미스릴로 표시되지 않는다', () => {
    expect(getRankTierFromRp(6200).tierNameKo).not.toBe('미스릴')
  })

  it('6400대는 메테오라이트로 표시된다', () => {
    expect(getRankTierFromRp(6450).displayLabel).toBe('메테오라이트 4')
  })

  it('7600 이상은 미스릴로 표시된다 (S11)', () => {
    expect(getRankTierFromRp(7600).displayLabel).toBe('미스릴')
  })

  it('S7 시즌 7100 이상은 미스릴', () => {
    expect(getRankTierFromRp(7100, null, 7).displayLabel).toBe('미스릴')
  })

  it('leaderboard rank 없이는 데미갓/이터니티로 표시하지 않는다', () => {
    expect(getRankTierFromRp(8000).displayLabel).toBe('미스릴')
    expect(getRankTierFromRp(8000, null).displayLabel).toBe('미스릴')
  })

  it('S11 데미갓은 RP 8300 미만이면 등수만으로 승급하지 않는다', () => {
    expect(getRankTierFromRp(8024, 740).displayLabel).toBe('미스릴')
    expect(getRankTierFromRp(8350, 740).displayLabel).toBe('데미갓')
  })

  it('RP 없으면 API tierName fallback', () => {
    expect(normalizeRankTier({ apiTierName: 'DIAMOND2' }).displayLabel).toBe('DIAMOND2')
  })
})
