import { describe, expect, it } from 'vitest'

import {
  buildMockStatsForUser,
  getDemoAnalysisMatchesForSeason,
  getDemoMatchDetail,
  getDemoPlayerAnalysisReport,
  getDemoPlayerCharacterReports,
  getDemoPlayerRankingPosition,
  getDemoPlayerCompactSummary,
  getDemoPlayerRoleSummary,
  getDemoPlayerRpTrend,
  getDemoPlayerSeasonHistory,
  getDemoPlayerTopSummary,
  getDemoSeasonSnapshot,
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
    expect(samples).toContain('마인')
    expect(samples).toContain('RustyMango')
    expect(samples.length).toBe(6)
  })

  it('마인 — equipmentPreview (demo-mine-001)', () => {
    const matches = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')
    const withGear = matches.find((m) => m.matchId === 'demo-mine-001')
    expect(withGear?.equipmentPreview?.weaponTypeSlug).toBe('weapons/weapon-group/shuriken')
  })

  it('searchMockPlayersByNickname — 마인 검색', () => {
    const results = searchMockPlayersByNickname('마인')
    expect(results).toHaveLength(1)
    expect(results[0]?.nickname).toBe('마인')
    expect(results[0]?.userNum).toBe(920517)
  })

  it('getMockPlayerSummaryByNickname — 마인', () => {
    expect(getMockPlayerSummaryByNickname('마인')?.tier).toBe('미스릴')
  })

  it('getDemoPlayerAnalysisReport — 마인 report 생성', () => {
    const report = getDemoPlayerAnalysisReport('마인')
    expect(report).not.toBeNull()
    expect(report?.status).toBe('ok')
    expect(report?.playerMatchCount).toBe(12)
    expect(report?.overallGrade).not.toBeNull()
    expect(report?.metrics.length).toBeGreaterThan(0)
  })

  it('getDemoPlayerCharacterReports — 마인 캐릭터 분석', () => {
    const reports = getDemoPlayerCharacterReports('마인')
    expect(reports.length).toBe(3)

    const graded = reports.filter((r) => r.matchCount >= 2 && r.overallGrade !== null)
    expect(graded.length).toBeGreaterThanOrEqual(2)

    const yuki = reports.find((r) => r.characterName === '유키')
    const hyejin = reports.find((r) => r.characterName === '혜진')
    expect(yuki?.matchCount).toBe(5)
    expect(hyejin?.matchCount).toBe(3)
    expect(yuki?.overallGrade).not.toBeNull()
    expect(hyejin?.overallGrade).not.toBeNull()
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

  it('getDemoPlayerRankingPosition — 마인', () => {
    expect(getDemoPlayerRankingPosition('마인')).toEqual({ position: 5, total: 16 })
  })

  it('getDemoPlayerRankingPosition — 없는 닉네임 null', () => {
    expect(getDemoPlayerRankingPosition('없는닉네임xyz')).toBeNull()
  })

  it('getDemoPlayerRpTrend — 마인 최근 7경기만', () => {
    const trend = getDemoPlayerRpTrend('마인')
    expect(trend.length).toBeGreaterThanOrEqual(2)
    expect(trend.length).toBeLessThanOrEqual(7)
    expect(trend[0]?.rpAfter).toBeGreaterThan(0)
    expect(trend.at(-1)?.rpAfter).toBe(2420)
  })

  it('getDemoPlayerRpTrend — rpAfter 없는 플레이어 빈 배열', () => {
    expect(getDemoPlayerRpTrend('한강쐐기')).toEqual([])
  })

  it('getDemoMatchDetail — demo-mine-001', () => {
    const detail = getDemoMatchDetail('demo-mine-001')
    expect(detail).not.toBeNull()
    expect(detail?.match.matchId).toBe('demo-mine-001')
    expect(detail?.match.characterName).toBe('Yuki')
    expect(detail?.match.placement).toBe(1)
    expect(detail?.nickname).toBe('마인')
  })

  it('getDemoPlayerSeasonHistory — 마인 S10·S11 티어', () => {
    const history = getDemoPlayerSeasonHistory(920517)
    expect(history.length).toBeGreaterThan(0)
    expect(history.some((s) => s.seasonNumber === 10)).toBe(true)
    expect(history.some((s) => s.seasonNumber === 11)).toBe(true)
    expect(history.find((s) => s.seasonNumber === 10)?.tier).toBe('플래티넘 2')
    expect(history.find((s) => s.seasonNumber === 11)?.rank).toEqual({ tier: '미스릴', rp: 7650 })
  })

  it('getDemoPlayerSeasonHistory — 한강쐐기 S11 이터니티', () => {
    const s11 = getDemoPlayerSeasonHistory(847291).find((s) => s.seasonNumber === 11)
    expect(s11?.rank).toEqual({ tier: '이터니티', rp: 9340, rank: 34 })
  })

  it('getDemoPlayerSeasonHistory — 프로토콜Y S11 데미갓', () => {
    const s11 = getDemoPlayerSeasonHistory(301882).find((s) => s.seasonNumber === 11)
    expect(s11?.rank).toEqual({ tier: '데미갓', rp: 8720, rank: 523 })
  })

  it('getDemoSeasonSnapshot — 마인 S10', () => {
    const snapshot = getDemoSeasonSnapshot(920517, 10)
    expect(snapshot).not.toBeNull()
    expect(snapshot?.wins).toBeGreaterThanOrEqual(0)
    expect(snapshot?.kdaString).toMatch(/^\d+\.\d{2}$/)
  })

  it('getDemoMatchDetail — 없는 matchId null', () => {
    expect(getDemoMatchDetail('missing-match-id')).toBeNull()
  })

  it('getDemoPlayerCompactSummary — 마인 집계', () => {
    const summary = getDemoPlayerCompactSummary('마인', 11)
    expect(summary).not.toBeNull()
    expect(summary?.sampleSize).toBe(12)
    expect(summary?.averageTeamKills).toBeGreaterThan(0)
    expect(summary?.winRate).toBeGreaterThan(0)
    expect(summary?.averagePlacement).toBeGreaterThan(0)
  })

  it('getDemoPlayerCompactSummary — 없는 닉네임 null', () => {
    expect(getDemoPlayerCompactSummary('없는닉네임xyz')).toBeNull()
  })

  it('getDemoPlayerCompactSummary — optional 필드 없는 플레이어 예외 없음', () => {
    const summary = getDemoPlayerCompactSummary('한강쐐기', 11)
    expect(summary).not.toBeNull()
    expect(summary?.averageTeamKills).toBeNull()
    expect(summary?.averageDamageToPlayers).toBeNull()
  })

  it('getDemoPlayerTopSummary — 마인 집계', () => {
    const summary = getDemoPlayerTopSummary('마인', 11)
    expect(summary).not.toBeNull()
    expect(summary?.sampleSize).toBe(12)
    expect(summary?.averageTeamKills).toBeGreaterThan(0)
    expect(summary?.winRate).toBeGreaterThan(0)
    expect(summary?.rpTrendPoints.length).toBeGreaterThanOrEqual(2)
  })

  it('getDemoPlayerTopSummary — 없는 닉네임 null', () => {
    expect(getDemoPlayerTopSummary('없는닉네임xyz')).toBeNull()
  })

  it('getDemoPlayerTopSummary — optional 필드 없는 플레이어 예외 없음', () => {
    const summary = getDemoPlayerTopSummary('한강쐐기', 11)
    expect(summary).not.toBeNull()
    expect(summary?.averageTeamKills).toBeNull()
    expect(summary?.averageDamageToPlayers).toBeNull()
  })

  it('getDemoPlayerRoleSummary — 마인 주 역할군', () => {
    const roles = getDemoPlayerRoleSummary('마인', 11)
    expect(roles?.status).toBe('ready')
    expect(roles?.primaryRole).toBe('딜러')
  })

  it('getDemoPlayerRoleSummary — 없는 닉네임 null', () => {
    expect(getDemoPlayerRoleSummary('없는닉네임xyz')).toBeNull()
  })
})
