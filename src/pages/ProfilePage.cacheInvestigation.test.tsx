import { describe, expect, it } from 'vitest'

import { selectProfileCharacterReports } from '@/analysis/profileCharacterStatsPriority'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerSeasonAggregateDTO } from '@/types/player'

function report(characterNum: number, matchCount: number): CharacterAnalysisReport {
  return {
    characterNum,
    characterName: `캐릭터 ${characterNum}`,
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

/**
 * 39.9C-INVESTIGATION — UI 표시 원인 재현 (수정 아님)
 */
describe('ProfilePage cache investigation — character source', () => {
  it('backfillProgress complete + official stats 있으면 official-stats 즉시 선택', () => {
    const statsReports = [report(1, 120), report(2, 80)]
    const result = selectProfileCharacterReports({
      aggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 39,
        cacheStatus: 'ready',
        source: 'cache',
        basisLabel: '시즌 전체 랭크 경기 기준',
        isRefreshing: false,
        backfillProgress: { status: 'complete', officialSeasonGames: 48, collectedGames: 48 },
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      } satisfies PlayerSeasonAggregateDTO,
      aggregateReports: [],
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: true,
    })
    expect(result.source).toBe('official-stats')
    expect(result.reports).toHaveLength(2)
  })

  it('partial aggregate + official richer면 row 수 유지', () => {
    const statsReports = [report(1, 120), report(2, 80), report(3, 40)]
    const result = selectProfileCharacterReports({
      aggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 39,
        cacheStatus: 'partial',
        source: 'matchCache',
        isRefreshing: true,
        backfillProgress: { status: 'running', officialSeasonGames: 335, collectedGames: 50 },
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: new Date().toISOString(),
      },
      aggregateReports: [report(1, 12)],
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    expect(result.reports).toHaveLength(3)
    expect(result.source).toBe('official-stats')
  })
})

describe('ProfilePage cache investigation — isRefreshing semantics', () => {
  function isSeasonAggregateRefreshing(aggregate: PlayerSeasonAggregateDTO | null): boolean {
    if (!aggregate) return false
    if (aggregate.isRefreshing === false) return false
    if (aggregate.isRefreshing === true) return true
    if (aggregate.backfillProgress?.status === 'complete') return false
    return (
      aggregate.cacheStatus === 'partial' ||
      aggregate.cacheStatus === 'warming' ||
      aggregate.cacheStatus === 'stale'
    )
  }

  it('backfillProgress complete면 isRefreshing=false로 간주', () => {
    expect(
      isSeasonAggregateRefreshing({
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 39,
        cacheStatus: 'ready',
        isRefreshing: undefined,
        backfillProgress: { status: 'complete', officialSeasonGames: 48, collectedGames: 48 },
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: '',
      }),
    ).toBe(false)
  })

  it('cacheStatus partial이면 isRefreshing=true', () => {
    expect(
      isSeasonAggregateRefreshing({
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 39,
        cacheStatus: 'partial',
        isRefreshing: undefined,
        backfillProgress: { status: 'running', officialSeasonGames: 335, collectedGames: 50 },
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: '',
      }),
    ).toBe(true)
  })
})
