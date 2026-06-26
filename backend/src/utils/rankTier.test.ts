import { describe, expect, it } from 'vitest'

import { getRankTierFromRp, normalizeRankTier, resolveCharacterGradePlayerTier } from './rankTier.js'

describe('rankTier official RP ranges', () => {
  it('6000 RP는 미스릴이 아니다', () => {
    expect(getRankTierFromRp(6000).tierNameKo).not.toBe('미스릴')
  })

  it('6049 RP는 다이아몬드 2', () => {
    expect(getRankTierFromRp(6049).displayLabel).toBe('다이아몬드 2')
  })

  it('6050 RP는 다이아몬드 1', () => {
    expect(getRankTierFromRp(6050).displayLabel).toBe('다이아몬드 1')
  })

  it('6399 RP는 다이아몬드 1', () => {
    expect(getRankTierFromRp(6399).displayLabel).toBe('다이아몬드 1')
  })

  it('6400 RP는 메테오라이트 4', () => {
    expect(getRankTierFromRp(6400).displayLabel).toBe('메테오라이트 4')
  })

  it('7150 RP는 메테오라이트 2 (S11)', () => {
    expect(getRankTierFromRp(7150).displayLabel).toBe('메테오라이트 2')
  })

  it('7399 RP는 메테오라이트 1', () => {
    expect(getRankTierFromRp(7399).displayLabel).toBe('메테오라이트 1')
  })

  it('7600 RP는 미스릴 (S11)', () => {
    expect(getRankTierFromRp(7600).displayLabel).toBe('미스릴')
  })

  it('7400 RP는 S10 기준 미스릴', () => {
    expect(getRankTierFromRp(7400, null, 10).displayLabel).toBe('미스릴')
  })

  it('leaderboard rank 300 이내 + 7400+ RP면 이터니티 (S10)', () => {
    expect(getRankTierFromRp(8000, 200, 10).displayLabel).toBe('이터니티')
  })

  it('leaderboard rank 1000 이내 + 7400+ RP면 데미갓 (S10)', () => {
    expect(getRankTierFromRp(8000, 500, 10).displayLabel).toBe('데미갓')
  })

  it('S11 데미갓은 RP 8300 이상 && top 1000', () => {
    expect(getRankTierFromRp(8299, 500, 11).displayLabel).toBe('미스릴')
    expect(getRankTierFromRp(8300, 500, 11).displayLabel).toBe('데미갓')
    expect(getRankTierFromRp(8300, 1500, 11).displayLabel).toBe('미스릴')
    expect(getRankTierFromRp(8500, 200, 11).displayLabel).toBe('이터니티')
  })

  it('leaderboard rank 없으면 8000 RP도 미스릴', () => {
    expect(getRankTierFromRp(8000).displayLabel).toBe('미스릴')
  })

  it('RP 없으면 API tierName fallback', () => {
    expect(normalizeRankTier({ apiTierName: 'DIAMOND2' }).displayLabel).toBe('DIAMOND2')
  })

  it('배치 없이 스쿼드 경기·MMR만 있어도 등급 기준 티어를 잡는다', () => {
    const tier = resolveCharacterGradePlayerTier({
      placedRank: null,
      squad: { totalGames: 42, mmr: 6400, rank: 0 },
      displaySeason: 11,
    })
    expect(tier?.displayLabel).toBe('메테오라이트 4')
  })

  it('배치 완료 시 스쿼드 MMR을 우선한다', () => {
    const tier = resolveCharacterGradePlayerTier({
      placedRank: { mmr: 5000, rank: 12000 },
      squad: { totalGames: 80, mmr: 6400, rank: 12000 },
      displaySeason: 11,
    })
    expect(tier?.displayLabel).toBe('메테오라이트 4')
  })
})
