import { describe, expect, it } from 'vitest'

import {
  buildMockStatsForUser,
  getDemoPlayerAnalysisReport,
  getDemoPlayerCharacterReports,
  getMockPlayerByUserNum,
  getMockPlayerSummaryByNickname,
  getSamplePlayerNicknames,
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

  it('스탯 raw counter 필드 채움', () => {
    const stats = buildMockStatsForUser(847291)
    expect(stats).not.toBeNull()
    expect(stats?.games).toBe(5)
    expect(stats?.wins).toBeGreaterThan(0)
    expect(stats?.kills).toBeGreaterThan(0)
    expect(stats?.mmr).toBeGreaterThan(0)
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

  it('getSamplePlayerNicknames — players.json 닉네임 목록', () => {
    const samples = getSamplePlayerNicknames()
    expect(samples).toContain('한강쐐기')
    expect(samples).toContain('RustyMango')
    expect(samples.length).toBe(5)
  })

  it('getDemoPlayerAnalysisReport — 샘플 닉네임 report 생성', () => {
    const report = getDemoPlayerAnalysisReport('한강쐐기')
    expect(report).not.toBeNull()
    expect(report?.status).toBe('ok')
    expect(report?.metrics.length).toBeGreaterThan(0)
  })

  it('getDemoPlayerAnalysisReport — 없는 닉네임 null', () => {
    expect(getDemoPlayerAnalysisReport('없는닉네임xyz')).toBeNull()
  })

  it('getDemoPlayerCharacterReports — 샘플 닉네임 캐릭터 분석', () => {
    const reports = getDemoPlayerCharacterReports('한강쐐기')
    expect(reports.length).toBeGreaterThan(0)
    expect(reports.every((r) => r.matchCount > 0)).toBe(true)
    expect(reports.every((r) => r.characterName.length > 0)).toBe(true)
  })

  it('getDemoPlayerCharacterReports — 없는 닉네임 빈 배열', () => {
    expect(getDemoPlayerCharacterReports('없는닉네임xyz')).toEqual([])
  })

  it('getDemoPlayerAnalysisReport — 기존 동작 유지', () => {
    expect(getDemoPlayerAnalysisReport('한강쐐기')?.status).toBe('ok')
  })
})
