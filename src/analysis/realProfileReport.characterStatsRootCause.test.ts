import { describe, expect, it } from 'vitest'

import {
  buildRealProfileCharacterReports,
  SEASON_CHARACTER_STATS_LABEL,
} from '@/analysis/realProfileReport'
import { selectProfileCharacterReports } from '@/analysis/profileCharacterStatsPriority'
import type { CharacterAnalysisReport } from '@/analysis/types'

/** 39.10F — official stats sparse + aggregate off 시 top3 `-` 재현 */
describe('realProfileReport characterStats root cause (39.10F)', () => {
  const sparseOfficialStats = [
    { characterCode: 1, totalGames: 120, wins: 40, top3: 80, averageRank: 4.1 },
    { characterCode: 17, totalGames: 80, wins: 20, top3: 50, averageRank: 4.5 },
    { characterCode: 11, totalGames: 40, wins: 10, top3: 20, averageRank: 5.1 },
  ]

  it('official stats only — combat 필드가 NaN이라 UI는 - 로 표시', () => {
    const { reports, source, sourceLabel } = buildRealProfileCharacterReports(
      sparseOfficialStats,
      [],
    )
    expect(source).toBe('season')
    expect(sourceLabel).toBe(SEASON_CHARACTER_STATS_LABEL)
    expect(reports).toHaveLength(3)
    for (const row of reports) {
      expect(Number.isNaN(row.kda)).toBe(true)
      expect(Number.isNaN(row.avgKills)).toBe(true)
      expect(row.avgDamageToPlayers).toBeNull()
    }
  })

  it('aggregate disabled + official stats — selectProfileCharacterReports가 official만 선택', () => {
    const statsReports = buildRealProfileCharacterReports(sparseOfficialStats, []).reports
    const selection = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    expect(selection.source).toBe('official-stats')
    expect(selection.reports).toHaveLength(3)
    expect(
      selection.reports.every(
        (row: CharacterAnalysisReport) =>
          Number.isNaN(row.kda) || row.avgKills == null || Number.isNaN(row.avgKills),
      ),
    ).toBe(true)
  })

  it('playerMatch DB rich + official sparse — DB combat 값 유지', () => {
    const playerMatchReports = [
      {
        characterNum: 1,
        characterName: '재키',
        matchCount: 12,
        avgPlacement: 4,
        avgKills: 2.5,
        avgAssists: 3,
        avgTeamKills: 8,
        avgDamageToPlayers: 13000,
        kda: 3.5,
        top3Rate: 50,
        winRate: 33,
        overallScore: null,
        status: 'ok' as const,
        overallGrade: 'A' as const,
        gradeLabel: 'A',
        feedback: '',
      },
    ]
    const statsReports = buildRealProfileCharacterReports(sparseOfficialStats, []).reports
    const selection = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports,
      recentReports: [],
      playerMatchReports,
      aggregateShouldWait: false,
    })
    expect(selection.source).toBe('player-match')
    expect(selection.reports.length).toBeGreaterThanOrEqual(3)
    const jacky = selection.reports.find((row) => row.characterNum === 1)
    expect(jacky?.kda).toBe(3.5)
    expect(Number.isFinite(jacky?.avgKills ?? NaN)).toBe(true)
  })

  it('DB rich aggregate가 있어도 official이 더 많으면 merge 시 official 우선 — combat sparse 유지 가능', () => {
    const statsReports = buildRealProfileCharacterReports(sparseOfficialStats, []).reports
    const aggregateReports: CharacterAnalysisReport[] = [
      {
        characterNum: 19,
        characterName: '엠마',
        matchCount: 12,
        avgPlacement: 4,
        avgKills: 2.5,
        avgAssists: 3,
        avgTeamKills: 8,
        avgDamageToPlayers: 13000,
        kda: 3.5,
        top3Rate: 50,
        winRate: 33,
        overallScore: null,
        status: 'ok',
        overallGrade: 'A',
        gradeLabel: 'A',
        feedback: '',
      },
    ]
    const selection = selectProfileCharacterReports({
      aggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 11,
        cacheStatus: 'ready',
        source: 'mixed',
        basisLabel: 'test',
        isRefreshing: false,
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      },
      aggregateReports,
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    expect(selection.source).toBe('official-stats')
    expect(selection.reports.length).toBeGreaterThanOrEqual(3)
    const jacky = selection.reports.find((row) => row.characterNum === 1)
    expect(jacky).toBeDefined()
    expect(Number.isNaN(jacky?.kda ?? 0)).toBe(true)
  })
})
