import { describe, expect, it } from 'vitest'

import { buildAnalysisTabViewModel } from '@/analysis/analysisTabViewModel'
import {
  ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE,
  computeAnalysisEligibility,
} from '@/analysis/analysisEligibility'
import {
  ANALYSIS_SOURCE_COMPLETE,
  buildAnalysisTabMeta,
} from '@/analysis/analysisTabMeta'
import {
  getDemoAnalysisMatchesForSeason,
  getDemoPlayStyleAnalysisForSeason,
  getDemoPlayerAnalysisReportForSeason,
  getDemoPlayerAnalysisCharacterReportsForSeason,
} from '@/mocks/loader'
import type { MatchSummary } from '@/types/match'

function makeRankMatches(count: number): MatchSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    matchId: `rank-${index}`,
    userNum: 1,
    gameStartedAt: '2026-06-01T00:00:00.000Z',
    characterName: 'Nathapon',
    characterNum: 1,
    placement: 3,
    kills: 2,
    assists: 1,
    deaths: 1,
    victory: false,
    seasonNumber: 11,
    gameMode: 'rank' as const,
  }))
}

describe('buildAnalysisTabViewModel', () => {
  it('마인 분석탭 view model 생성', () => {
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      characterReports: getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: '랭크 · 최근 20판 기준',
    })

    expect(vm.status).toBe('ok')
    expect(vm.summaryCards.length).toBeGreaterThan(0)
    expect(vm.metricSections.length).toBeGreaterThan(0)
    expect(vm.characters.length).toBeGreaterThan(0)
    for (const row of vm.characters) {
      const rate = Number.parseFloat(row.winRate.replace('%', ''))
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(100)
    }
    expect(vm.chartData.length).toBe(6)
    expect(vm.confidenceLabel).toBeTruthy()
    expect(vm.readyMetricCount).toBeGreaterThan(0)
    expect(vm.disclaimer).toContain('ERCraft')
  })

  it('핵심 요약 카드는 future가 아님', () => {
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      characterReports: getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    for (const card of vm.summaryCards) {
      expect(card.status).not.toBe('future')
    }
  })

  it('표본 부족 시 insufficient', () => {
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: null,
      analysisReport: null,
      characterReports: [],
      analysisMatches: [],
      basisLabel: 'test',
    })
    expect(vm.status).toBe('insufficient')
  })

  it('metric card에 백분위 badge 없음', () => {
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      characterReports: getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    const allValues = [
      ...vm.summaryCards,
      ...vm.metricSections.flatMap((s) => s.metrics),
    ]
      .map((c) => c.value)
      .join(' ')

    expect(allValues).not.toMatch(/샘플\s*상위/)
    expect(allValues).not.toMatch(/SSS/i)

    for (const card of allValues.split(' ')) {
      expect(card).not.toMatch(/NaN|Infinity/)
    }
  })

  it('팀운 섹션은 teamLuck view model로 제공', () => {
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      characterReports: getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    expect(vm.teamLuck).toBeDefined()
    expect(vm.metricSections.find((s) => s.id === 'teamPreview')).toBeUndefined()
  })

  it('역할 적합도 카드 미노출', () => {
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      characterReports: getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    const ids = vm.metricSections.flatMap((s) => s.metrics.map((m) => m.id))
    expect(ids).not.toContain('roleFitScore')
  })

  it('analysisTabMeta가 있으면 source/sample/confidence를 meta 기준으로 표시', () => {
    const meta = buildAnalysisTabMeta({
      seasonAggregate: {
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
          characterCount: 0,
          rpPointCount: 0,
          coverageRatio: 1,
        },
      },
      statsDto: null,
      recentMatchCount: 10,
      characterStatsSource: 'aggregate',
    })
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      characterReports: getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
      analysisTabMeta: meta,
    })

    expect(vm.sourceLabel).toBe(ANALYSIS_SOURCE_COMPLETE)
    expect(vm.sampleSize).toBe(12)
    expect(vm.sampleLabel).toBe('표본 808전')
    expect(vm.confidenceLabel).toBe('신뢰도 높음')
    expect(vm.showScopeSplit).toBe(true)
    expect(vm.showCardTrendBasis).toBe(false)
    expect(vm.showFooterBasisNote).toBe(false)
    expect(vm.trendBasisLabel).toBe('최근 10경기 기준')
    expect(vm.seasonSourceLabel).toBe(ANALYSIS_SOURCE_COMPLETE)
  })

  it('전체 캐릭터 20판 이상이면 production axes 없어도 분석 표시', () => {
    const matches = makeRankMatches(22)
    const eligibility = computeAnalysisEligibility({
      matches,
      seasonNumber: 11,
      seasonFallback: 11,
    })
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: {
        status: 'insufficient',
        sampleSize: 0,
        axisScores: {},
        tierAverageAxes: {},
        roleFitScores: {},
        primaryRole: null,
        secondaryRole: null,
        roleConfidence: 'low',
        roleReasonSummary: '분석 보류',
        unavailableMetrics: [],
        overallScore: null,
        strengths: [],
        improvements: [],
        comment: '분석 보류',
        chartData: [],
        axisDetails: [],
        basisLabel: 'test',
      },
      analysisReport: null,
      characterReports: [],
      analysisMatches: matches,
      analysisSeasonMatches: matches,
      analysisEligibility: eligibility,
      seasonNumber: 11,
      basisLabel: 'test',
    })

    expect(eligibility.analysisEligibleMatches).toBeGreaterThanOrEqual(
      ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE,
    )
    expect(vm.status).toBe('ok')
    expect(vm.sampleBasisNote).toContain(String(eligibility.analysisEligibleMatches))
  })

  it('benchmark cohort가 비어도 개인 분석은 표시', () => {
    const matches = makeRankMatches(22)
    const eligibility = computeAnalysisEligibility({
      matches,
      seasonNumber: 11,
      seasonFallback: 11,
    })
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      characterReports: getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20'),
      analysisMatches: matches,
      analysisSeasonMatches: matches,
      analysisEligibility: eligibility,
      seasonNumber: 11,
      populationMatchSets: [],
      tierPopulationMatchSets: [],
      populationMatches: [],
      basisLabel: 'test',
    })

    expect(vm.status).toBe('ok')
    expect(vm.axisRows.length).toBeGreaterThan(0)
  })

  it('전체 캐릭터 19판이면 표본 부족', () => {
    const matches = makeRankMatches(19)
    const eligibility = computeAnalysisEligibility({
      matches,
      seasonNumber: 11,
      seasonFallback: 11,
    })
    const vm = buildAnalysisTabViewModel({
      playStyleAnalysis: null,
      analysisReport: null,
      characterReports: [],
      analysisMatches: matches,
      analysisSeasonMatches: matches,
      analysisEligibility: eligibility,
      seasonNumber: 11,
      basisLabel: 'test',
    })

    expect(vm.status).toBe('insufficient')
    expect(vm.insightLine).toContain('19')
  })
})
