import { describe, expect, it } from 'vitest'

import {
  combatRichnessScore,
  mergeCharacterReports,
  resolveProfileCharacterReportSelection,
  selectProfileCharacterReports,
} from '@/analysis/profileCharacterStatsPriority'
import {
  ANALYSIS_SOURCE_COMPLETE,
  ANALYSIS_SOURCE_OFFICIAL,
  ANALYSIS_SOURCE_OFFICIAL_MERGE,
  ANALYSIS_SOURCE_PARTIAL,
  buildAnalysisTabMeta,
} from '@/analysis/analysisTabMeta'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerSeasonAggregateDTO } from '@/types/player'
import { resolveProfileSeasonAggregate } from '@/utils/seasonAggregateDisplay'
import { shouldAllowLiveAggregateUpdate } from '@/utils/profileSnapshotPolicy'

function report(
  characterNum: number,
  matchCount: number,
  overrides: Partial<CharacterAnalysisReport> = {},
): CharacterAnalysisReport {
  return {
    characterNum,
    characterName: `캐릭터 ${characterNum}`,
    matchCount,
    avgPlacement: 4,
    avgKills: 2.5,
    avgAssists: 2,
    avgTeamKills: 8,
    avgDamageToPlayers: 12000,
    kda: 3.2,
    top3Rate: 40,
    winRate: 30,
    overallScore: null,
    status: 'ok',
    overallGrade: 'A',
    gradeLabel: 'A',
    feedback: 'test',
    ...overrides,
  }
}

function sparseReport(characterNum: number, matchCount: number): CharacterAnalysisReport {
  return report(characterNum, matchCount, {
    avgKills: Number.NaN,
    avgAssists: Number.NaN,
    avgTeamKills: null,
    avgDamageToPlayers: null,
    kda: Number.NaN,
    overallGrade: null,
    gradeLabel: '시즌',
  })
}

function readyAggregate(): PlayerSeasonAggregateDTO {
  return {
    userNum: 456147087,
    seasonId: 11,
    apiSeasonId: 39,
    cacheStatus: 'ready',
    source: 'mixed',
    basisLabel: '시즌 전체 랭크 경기 기준',
    isRefreshing: false,
    characterStats: [],
    rpSeries: [],
    lastRefreshedAt: new Date().toISOString(),
  }
}

describe('39.9J profile data downgrade fix', () => {
  it('ready sparse aggregate는 row를 유지하고 merge 결과를 반환', () => {
    const statsReports = [report(31, 182), report(17, 100), report(11, 80)]
    const aggregateReports = [sparseReport(31, 182), sparseReport(17, 100), sparseReport(11, 80)]

    const selection = selectProfileCharacterReports({
      aggregate: readyAggregate(),
      aggregateReports,
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    expect(selection.source).toBe('aggregate')
    expect(selection.reports).toHaveLength(3)
    expect(selection.reports[0]?.matchCount).toBe(182)
  })

  it('mergeCharacterReports는 NaN이 finite 값을 덮지 않음', () => {
    const merged = mergeCharacterReports(
      [sparseReport(31, 182)],
      [report(31, 182)],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.kda).toBe(3.2)
    expect(merged[0]?.avgDamageToPlayers).toBe(12000)
  })

  it('combat-rich ready aggregate는 aggregate source 유지', () => {
    const aggregateReports = [report(19, 120), report(17, 80)]
    const selection = selectProfileCharacterReports({
      aggregate: readyAggregate(),
      aggregateReports,
      statsReports: [report(19, 120)],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    expect(selection.source).toBe('aggregate')
    expect(combatRichnessScore(selection.reports)).toBeGreaterThan(0)
  })
})

describe('39.9I profile data regression — diagnosis carry-over', () => {
  it('effective aggregate null + stats fallback이면 KDA NaN', () => {
    const statsReports = [sparseReport(31, 182)]
    const selection = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports,
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    expect(selection.source).toBe('official-stats')
    expect(selection.reports[0]?.kda).toBeNaN()
  })
})

describe('39.10A analysis tab meta', () => {
  function completeAggregate808(): PlayerSeasonAggregateDTO {
    return {
      ...readyAggregate(),
      backfillProgress: {
        status: 'complete',
        officialSeasonGames: 808,
        collectedGames: 808,
      },
      coverage: {
        officialSeasonGames: 808,
        collectedGames: 808,
        characterCount: 3,
        rpPointCount: 100,
        coverageRatio: 1,
      },
    }
  }

  it('canonical complete snapshot — 808전 표본 유지', () => {
    const selection = selectProfileCharacterReports({
      aggregate: completeAggregate808(),
      aggregateReports: [report(31, 300)],
      statsReports: [],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    const meta = buildAnalysisTabMeta({
      seasonAggregate: completeAggregate808(),
      statsDto: null,
      recentMatchCount: 10,
      characterStatsSource: selection.source,
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_COMPLETE)
    expect(meta.sampleSize).toBe(808)
    expect(meta.confidenceLevel).toBe('high')
  })

  it('partial aggregate + official stats 병합', () => {
    const partial: PlayerSeasonAggregateDTO = {
      ...readyAggregate(),
      cacheStatus: 'partial',
      isRefreshing: true,
      backfillProgress: {
        status: 'running',
        officialSeasonGames: 808,
        collectedGames: 38,
      },
      coverage: {
        officialSeasonGames: 808,
        collectedGames: 38,
        characterCount: 2,
        rpPointCount: 20,
        coverageRatio: 38 / 808,
      },
    }
    const selection = selectProfileCharacterReports({
      aggregate: partial,
      aggregateReports: [sparseReport(31, 38)],
      statsReports: [report(31, 200)],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    const meta = buildAnalysisTabMeta({
      seasonAggregate: partial,
      statsDto: {
        games: 200,
        winRate: 30,
        avgKills: 2,
        avgPlacement: 5,
        kda: 2,
        kdaString: '2.00',
        mostPlayedCharacter: { name: '재키', count: 10 },
        tier: '골드',
        mmr: 2000,
      },
      recentMatchCount: 10,
      characterStatsSource: selection.source,
      preferOfficialStatsDespitePartial: selection.preferOfficialStatsDespitePartial,
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_OFFICIAL_MERGE)
    expect(meta.sampleSize).toBe(38)
    expect(meta.confidenceLabel).toBe('보강 중')
  })

  it('aggregate 없이 official stats fallback', () => {
    const selection = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports: [report(31, 120)],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    const meta = buildAnalysisTabMeta({
      seasonAggregate: null,
      statsDto: {
        games: 120,
        winRate: 30,
        avgKills: 2,
        avgPlacement: 5,
        kda: 2,
        kdaString: '2.00',
        mostPlayedCharacter: { name: '재키', count: 10 },
        tier: '골드',
        mmr: 2000,
      },
      recentMatchCount: 0,
      characterStatsSource: selection.source,
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_OFFICIAL)
    expect(meta.sampleSize).toBe(120)
    expect(meta.confidenceLevel).toBe('high')
  })

  it('partial aggregate only', () => {
    const partial: PlayerSeasonAggregateDTO = {
      ...readyAggregate(),
      cacheStatus: 'partial',
      isRefreshing: true,
      backfillProgress: {
        status: 'running',
        officialSeasonGames: 808,
        collectedGames: 38,
      },
      coverage: {
        officialSeasonGames: 808,
        collectedGames: 38,
        characterCount: 2,
        rpPointCount: 20,
        coverageRatio: 38 / 808,
      },
    }
    const selection = selectProfileCharacterReports({
      aggregate: partial,
      aggregateReports: [sparseReport(31, 38)],
      statsReports: [],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    const meta = buildAnalysisTabMeta({
      seasonAggregate: partial,
      statsDto: null,
      recentMatchCount: 10,
      characterStatsSource: selection.source,
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_PARTIAL)
    expect(meta.sampleSize).toBe(38)
  })
})

describe('39.10D focus refetch season snapshot fix', () => {
  it('focus refetch sparse aggregate는 rich stash 유지', () => {
    const rich = {
      ...readyAggregate(),
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 300,
          assists: 400,
          deaths: 200,
          kda: 3.5,
          avgTeamKills: 8,
          avgKills: 2.5,
          avgDamage: 13000,
          gradeLabel: 'A',
        },
      ],
      rpSeries: [
        { matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8550 },
        { matchId: 'm-2', dateLabel: '6. 11.', rpAfter: 8600 },
      ],
      coverage: {
        officialSeasonGames: 335,
        collectedGames: 335,
        characterCount: 1,
        rpPointCount: 2,
        coverageRatio: 1,
      },
    }
    const sparse = {
      ...rich,
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 0,
          assists: 0,
          deaths: 0,
          kda: Number.NaN,
          avgTeamKills: null,
          avgKills: Number.NaN,
          avgDamage: null,
          gradeLabel: '시즌',
        },
      ],
      rpSeries: [],
      coverage: {
        officialSeasonGames: 335,
        collectedGames: 335,
        characterCount: 1,
        rpPointCount: 0,
        coverageRatio: 1,
      },
    }

    const resolved = resolveProfileSeasonAggregate({
      raw: sparse,
      summaryUserNum: rich.userNum,
      selectedSeason: 11,
      lastValid: rich,
    })

    expect(resolved.pickReason).toBe('reject-downgrade')
    expect(resolved.aggregate?.rpSeries).toHaveLength(2)
    expect(resolved.aggregate?.characterStats[0]?.kda).toBe(3.5)
  })

  it('더 풍부한 refetch aggregate는 교체', () => {
    const previous = {
      ...readyAggregate(),
      rpSeries: [],
      characterStats: [],
    }
    const richer = {
      ...previous,
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 300,
          assists: 400,
          deaths: 200,
          kda: 3.5,
          avgTeamKills: 8,
          avgKills: 2.5,
          avgDamage: 13000,
          gradeLabel: 'A',
        },
      ],
      rpSeries: [{ matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8550 }],
    }

    const resolved = resolveProfileSeasonAggregate({
      raw: richer,
      summaryUserNum: richer.userNum,
      selectedSeason: 11,
      lastValid: previous,
    })

    expect(resolved.pickReason).toBe('raw')
    expect(resolved.aggregate?.rpSeries).toHaveLength(1)
  })

  it('character stats sparse refetch는 rich stash 유지', () => {
    const richSelection = selectProfileCharacterReports({
      aggregate: readyAggregate(),
      aggregateReports: [report(31, 335)],
      statsReports: [],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })
    const sparseSelection = selectProfileCharacterReports({
      aggregate: readyAggregate(),
      aggregateReports: [sparseReport(31, 335)],
      statsReports: [],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    const resolved = resolveProfileCharacterReportSelection({
      stashKey: '절단마술사:11',
      selection: sparseSelection,
      lastRich: { key: '절단마술사:11', selection: richSelection },
    })

    expect(resolved.pickReason).toBe('stashed')
    expect(resolved.selection.reports[0]?.kda).toBe(3.2)
    expect(combatRichnessScore(resolved.selection.reports)).toBeGreaterThan(0)
  })

  it('games-only sparse merge는 finite KDA를 덮지 않음', () => {
    const merged = mergeCharacterReports([sparseReport(31, 335)], [report(31, 335)])
    expect(merged[0]?.kda).toBe(3.2)
    expect(merged[0]?.avgDamageToPlayers).toBe(12000)
  })
})

describe('39.10E cache-first manual refresh policy', () => {
  it('frozen snapshot은 sparse live aggregate 거부', () => {
    const rich = {
      ...readyAggregate(),
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 300,
          assists: 400,
          deaths: 200,
          kda: 3.5,
          avgTeamKills: 8,
          avgKills: 2.5,
          avgDamage: 13000,
          gradeLabel: 'A',
        },
      ],
      rpSeries: [{ matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8550 }],
    }
    const sparse = {
      ...rich,
      rpSeries: [],
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 0,
          assists: 0,
          deaths: 0,
          kda: Number.NaN,
          avgTeamKills: null,
          avgKills: Number.NaN,
          avgDamage: null,
          gradeLabel: '시즌',
        },
      ],
    }

    const resolved = resolveProfileSeasonAggregate({
      raw: undefined,
      summaryUserNum: rich.userNum,
      selectedSeason: 11,
      lastValid: rich,
    })

    expect(resolved.aggregate?.rpSeries).toHaveLength(1)
    expect(resolved.pickReason).toBe('stashed')

    const allowLive = shouldAllowLiveAggregateUpdate({
      frozen: true,
      displayed: rich,
      incoming: sparse,
    })
    expect(allowLive).toBe(false)
  })
})
