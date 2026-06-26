import { describe, expect, it } from 'vitest'

import {
  officialStatsRicherThanAggregate,
  resolveProfileCharacterReportSelection,
  selectProfileCharacterReports,
} from '@/analysis/profileCharacterStatsPriority'
import type { CharacterAnalysisReport } from '@/analysis/types'

function report(characterNum: number, matchCount: number, name?: string): CharacterAnalysisReport {
  return {
    characterNum,
    characterName: name ?? `캐릭터 ${characterNum}`,
    matchCount,
    avgPlacement: 4,
    avgKills: 2,
    avgAssists: 2,
    avgTeamKills: 8,
    avgDamageToPlayers: 10000,
    kda: 3,
    top3Rate: 0.4,
    winRate: 0.3,
    overallScore: null,
    status: 'ok',
    overallGrade: 'A',
    gradeLabel: 'A',
    feedback: 'test',
  }
}

describe('profileCharacterStatsPriority', () => {
  it('playerMatchReports가 있으면 official sparse보다 우선', () => {
    const playerMatchReports = [
      report(1, 12, '재키'),
      report(17, 10, '히야'),
      report(19, 8, '엠마'),
      report(11, 6, '마이'),
    ]
    const statsReports = [
      {
        ...report(1, 120, '재키'),
        avgKills: Number.NaN,
        avgAssists: Number.NaN,
        avgTeamKills: null,
        avgDamageToPlayers: null,
        kda: Number.NaN,
      },
      {
        ...report(17, 80, '히야'),
        avgKills: Number.NaN,
        kda: Number.NaN,
      },
      {
        ...report(11, 40, '유키'),
        avgKills: Number.NaN,
        kda: Number.NaN,
      },
    ]

    const result = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports,
      recentReports: [],
      playerMatchReports,
      aggregateShouldWait: false,
    })

    expect(result.source).toBe('player-match')
    expect(result.reports).toHaveLength(4)
    expect(result.reports.every((row) => Number.isFinite(row.kda))).toBe(true)
  })

  it('partial aggregate가 official stats보다 적으면 official stats를 유지', () => {
    const result = selectProfileCharacterReports({
      aggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 11,
        cacheStatus: 'partial',
        source: 'matchCache',
        basisLabel: '시즌 집계 중',
        isRefreshing: true,
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      },
      aggregateReports: [report(19, 12, '엠마')],
      statsReports: [
        report(19, 120, '엠마'),
        report(17, 80, '아드리아나'),
        report(11, 40, '유키'),
      ],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    expect(result.reports).toHaveLength(3)
    expect(result.source).toBe('official-stats')
    expect(result.preferOfficialStatsDespitePartial).toBe(true)
  })

  it('aggregate ready이면 aggregate를 우선', () => {
    const aggregateReports = [report(19, 120, '엠마'), report(17, 80, '아드리아나')]
    const result = selectProfileCharacterReports({
      aggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 11,
        cacheStatus: 'ready',
        source: 'mixed',
        basisLabel: '수집된 시즌 경기 기준',
        isRefreshing: false,
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      },
      aggregateReports,
      statsReports: [report(19, 120, '엠마')],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    expect(result.reports).toEqual(aggregateReports)
    expect(result.source).toBe('aggregate')
  })

  it('재검색 시나리오 — partial aggregate 도착 후에도 official stats row 수 유지', () => {
    const statsReports = [
      report(19, 120, '엠마'),
      report(17, 80, '아드리아나'),
      report(11, 40, '유키'),
    ]
    const first = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    const second = selectProfileCharacterReports({
      aggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 11,
        cacheStatus: 'partial',
        source: 'matchCache',
        basisLabel: '시즌 집계 중',
        isRefreshing: true,
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      },
      aggregateReports: [report(19, 12, '엠마')],
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    expect(first.reports).toHaveLength(3)
    expect(second.reports).toHaveLength(3)
    expect(second.source).toBe('official-stats')
  })

  it('backfill running 중에도 official stats가 있으면 분석 탭에 즉시 표시', () => {
    const statsReports = [report(19, 120, '엠마'), report(17, 80, '아드리아나')]
    const result = selectProfileCharacterReports({
      aggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 11,
        cacheStatus: 'warming',
        source: 'matchCache',
        basisLabel: '수집 경기 보강 중',
        isRefreshing: true,
        backfillProgress: { status: 'running', officialSeasonGames: 300, collectedGames: 40 },
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      },
      aggregateReports: [],
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: true,
    })

    expect(result.reports).toHaveLength(2)
    expect(result.source).toBe('official-stats')
  })

  it('officialStatsRicherThanAggregate — 캐릭터 수·판수 비교', () => {
    expect(
      officialStatsRicherThanAggregate(
        [report(1, 50), report(2, 40)],
        [report(1, 12)],
      ),
    ).toBe(true)
    expect(
      officialStatsRicherThanAggregate(
        [report(1, 12)],
        [report(1, 50), report(2, 40)],
      ),
    ).toBe(false)
  })

  it('resolveProfileCharacterReportSelection — sparse refetch는 stash 유지', () => {
    const rich = selectProfileCharacterReports({
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
      aggregateReports: [report(19, 335, '엘마')],
      statsReports: [],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    const sparse = selectProfileCharacterReports({
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
      aggregateReports: [
        {
          ...report(19, 335, '엘마'),
          avgKills: Number.NaN,
          avgAssists: Number.NaN,
          avgTeamKills: null,
          avgDamageToPlayers: null,
          kda: Number.NaN,
          gradeLabel: '시즌',
        },
      ],
      statsReports: [],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    const resolved = resolveProfileCharacterReportSelection({
      stashKey: 'player:11',
      selection: sparse,
      lastRich: { key: 'player:11', selection: rich },
    })

    expect(resolved.pickReason).toBe('stashed')
    expect(resolved.selection.reports[0]?.kda).toBe(3)
  })
})
