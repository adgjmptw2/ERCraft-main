import { describe, expect, it } from 'vitest'

import {
  buildMockStatsForUser,
  getMockPlayerByUserNum,
  getMockPlayerSummaryByNickname,
  searchMockPlayersByNickname,
  sliceMockMatchHistory,
} from '@/mocks/loader'

describe('mock loader', () => {
  it('닉네임 부분 검색', () => {
    const nicknames = searchMockPlayersByNickname('rust').map((p) => p.nickname)
    expect(nicknames).toContain('RustyMango')
  })

  it('한 글자 검색은 빈 배열', () => {
    expect(searchMockPlayersByNickname('r')).toEqual([])
  })

  it('없는 userNum 스탯은 null', () => {
    expect(buildMockStatsForUser(999_999)).toBeNull()
  })

  it('스탯 집계 필드 채움', () => {
    const stats = buildMockStatsForUser(847291)
    expect(stats).not.toBeNull()
    expect(stats?.games).toBe(5)
    expect(stats?.winRate).toBeDefined()
    expect(stats?.avgKills).toBeDefined()
    expect(stats?.avgPlacement).toBeDefined()
    expect(stats?.aggregateKda).toBeDefined()
  })

  it('매치 페이지네이션', () => {
    const page0 = sliceMockMatchHistory(847291, 0, 2)
    expect(page0.page).toBe(0)
    expect(page0.items).toHaveLength(2)
    expect(page0.hasNext).toBe(true)

    const page1 = sliceMockMatchHistory(847291, 1, 2)
    expect(page1.items).toHaveLength(2)
    expect(page1.hasNext).toBe(true)

    const page2 = sliceMockMatchHistory(847291, 2, 2)
    expect(page2.items).toHaveLength(1)
    expect(page2.hasNext).toBe(false)
  })

  it('getMockPlayerByUserNum', () => {
    expect(getMockPlayerByUserNum(847291)?.nickname).toBe('한강쐐기')
    expect(getMockPlayerByUserNum(1)).toBeUndefined()
  })

  it('getMockPlayerSummaryByNickname — 정확 일치만', () => {
    expect(getMockPlayerSummaryByNickname('RustyMango')?.userNum).toBe(192044)
    expect(getMockPlayerSummaryByNickname('rust')).toBeUndefined()
  })
})
