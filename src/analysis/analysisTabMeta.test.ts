import { describe, expect, it } from 'vitest'

import {
  ANALYSIS_SEASON_NONE,
  ANALYSIS_SOURCE_COMPLETE,
  ANALYSIS_SOURCE_NONE,
  ANALYSIS_SOURCE_OFFICIAL,
  ANALYSIS_SOURCE_OFFICIAL_MERGE,
  ANALYSIS_SOURCE_PARTIAL,
  ANALYSIS_TREND_INSUFFICIENT,
  buildAnalysisTabMeta,
} from '@/analysis/analysisTabMeta'
import type { PlayerSeasonAggregateDTO } from '@/types/player'

function readyAggregate(): PlayerSeasonAggregateDTO {
  return {
    userNum: 1,
    seasonId: 11,
    apiSeasonId: 11,
    cacheStatus: 'ready',
    isRefreshing: false,
    characterStats: [],
    rpSeries: [],
    lastRefreshedAt: '2026-06-01T00:00:00.000Z',
  }
}

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

describe('buildAnalysisTabMeta', () => {
  it('complete aggregate — 808전 시즌 전체 기준', () => {
    const meta = buildAnalysisTabMeta({
      seasonAggregate: completeAggregate808(),
      statsDto: null,
      recentMatchCount: 10,
      characterStatsSource: 'aggregate',
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_COMPLETE)
    expect(meta.sampleSize).toBe(808)
    expect(meta.sampleLabel).toBe('표본 808전')
    expect(meta.confidenceLevel).toBe('high')
    expect(meta.confidenceLabel).toBe('신뢰도 높음')
    expect(meta.isComplete).toBe(true)
    expect(meta.isPartial).toBe(false)
  })

  it('partial aggregate — 38전 보강 중', () => {
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

    const meta = buildAnalysisTabMeta({
      seasonAggregate: partial,
      statsDto: null,
      recentMatchCount: 10,
      characterStatsSource: 'aggregate',
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_PARTIAL)
    expect(meta.sampleSize).toBe(38)
    expect(meta.sampleLabel).toBe('표본 38전')
    expect(meta.confidenceLabel).toBe('보강 중')
    expect(meta.isPartial).toBe(true)
    expect(meta.isBackfilling).toBe(true)
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
      characterStatsSource: 'official-stats',
      preferOfficialStatsDespitePartial: true,
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_OFFICIAL_MERGE)
    expect(meta.sampleSize).toBe(38)
    expect(meta.confidenceLabel).toBe('보강 중')
  })

  it('official stats fallback', () => {
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
      characterStatsSource: 'official-stats',
    })

    expect(meta.sourceLabel).toBe(ANALYSIS_SOURCE_OFFICIAL)
    expect(meta.sampleSize).toBe(120)
    expect(meta.confidenceLevel).toBe('high')
    expect(meta.confidenceLabel).toBe('신뢰도 높음')
  })

  it('matches sample only', () => {
    const meta = buildAnalysisTabMeta({
      seasonAggregate: null,
      statsDto: null,
      recentMatchCount: 8,
      characterStatsSource: 'recent-matches',
    })

    expect(meta.seasonSourceLabel).toBe(ANALYSIS_SEASON_NONE)
    expect(meta.sourceLabel).toBe(ANALYSIS_SEASON_NONE)
    expect(meta.trendBasisLabel).toBe('최근 8경기 기준')
    expect(meta.trendSampleCount).toBe(8)
    expect(meta.confidenceLevel).toBe('insufficient')
    expect(meta.confidenceLabel).toBe('표본 부족')
  })

  it('no data', () => {
    const meta = buildAnalysisTabMeta({
      seasonAggregate: null,
      statsDto: null,
      recentMatchCount: 0,
      characterStatsSource: 'none',
    })

    expect(meta.seasonSourceLabel).toBe(ANALYSIS_SEASON_NONE)
    expect(meta.sourceLabel).toBe(ANALYSIS_SEASON_NONE)
    expect(meta.trendBasisLabel).toBe(ANALYSIS_TREND_INSUFFICIENT)
    expect(meta.sampleSize).toBe(0)
    expect(meta.sampleLabel).toBe('표본 부족')
    expect(meta.confidenceLevel).toBe('insufficient')
    expect(meta.scopeNote).toBe(ANALYSIS_SOURCE_NONE)
  })
})

describe('39.10B analysis scope consistency', () => {
  function completeAggregate808(): PlayerSeasonAggregateDTO {
    return {
      userNum: 1,
      seasonId: 11,
      apiSeasonId: 11,
      cacheStatus: 'ready',
      isRefreshing: false,
      characterStats: [],
      rpSeries: [],
      lastRefreshedAt: '2026-06-01T00:00:00.000Z',
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

  it('complete aggregate 808 + recent 27 — 시즌·경향 분리', () => {
    const meta = buildAnalysisTabMeta({
      seasonAggregate: completeAggregate808(),
      statsDto: null,
      recentMatchCount: 27,
      characterStatsSource: 'aggregate',
    })

    expect(meta.seasonSourceLabel).toBe(ANALYSIS_SOURCE_COMPLETE)
    expect(meta.seasonSampleCount).toBe(808)
    expect(meta.trendBasisLabel).toBe('최근 27경기 기준')
    expect(meta.trendSampleCount).toBe(27)
    expect(meta.scopeNote).toBeNull()
    expect(meta.seasonSampleCount).not.toBe(meta.trendSampleCount)
  })

  it('partial aggregate 214 + recent 27 — 보강 중 시즌·경향 분리', () => {
    const partial: PlayerSeasonAggregateDTO = {
      ...completeAggregate808(),
      cacheStatus: 'partial',
      isRefreshing: true,
      backfillProgress: {
        status: 'running',
        officialSeasonGames: 808,
        collectedGames: 214,
      },
      coverage: {
        officialSeasonGames: 808,
        collectedGames: 214,
        characterCount: 2,
        rpPointCount: 20,
        coverageRatio: 214 / 808,
      },
    }

    const meta = buildAnalysisTabMeta({
      seasonAggregate: partial,
      statsDto: null,
      recentMatchCount: 27,
      characterStatsSource: 'aggregate',
    })

    expect(meta.seasonSourceLabel).toBe(ANALYSIS_SOURCE_PARTIAL)
    expect(meta.seasonSampleCount).toBe(214)
    expect(meta.trendBasisLabel).toBe('최근 27경기 기준')
    expect(meta.seasonConfidenceLabel).toBe('보강 중')
    expect(meta.scopeNote).toBe('시즌 데이터는 보강 중')
  })

  it('official stats only + recent matches', () => {
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
      recentMatchCount: 15,
      characterStatsSource: 'official-stats',
    })

    expect(meta.seasonSourceLabel).toBe(ANALYSIS_SOURCE_OFFICIAL)
    expect(meta.seasonSampleCount).toBe(120)
    expect(meta.trendBasisLabel).toBe('최근 15경기 기준')
    expect(meta.seasonConfidenceLabel).toBe('신뢰도 높음')
  })

  it('matches only 5경기 — 시즌 부족·경향 낮음', () => {
    const meta = buildAnalysisTabMeta({
      seasonAggregate: null,
      statsDto: null,
      recentMatchCount: 5,
      characterStatsSource: 'recent-matches',
    })

    expect(meta.seasonSourceLabel).toBe(ANALYSIS_SEASON_NONE)
    expect(meta.trendBasisLabel).toBe('최근 5경기 기준')
    expect(meta.seasonConfidenceLabel).toBe('표본 부족')
  })
})
