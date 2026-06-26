import { describe, expect, it } from 'vitest'

import { buildPlayerAnalysisViewModel } from '@/analysis/playerAnalysisViewModel'
import type { PlayerPlayStyleAnalysis } from '@/analysis/playStyleTypes'
import {
  getDemoAnalysisMatchesForSeason,
  getDemoPlayStyleAnalysisForSeason,
  getDemoPlayerAnalysisReportForSeason,
} from '@/mocks/loader'

describe('buildPlayerAnalysisViewModel', () => {
  it('마인 mock player view model 생성', () => {
    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: '랭크 · 최근 20판 기준',
    })

    expect(vm.dataConfidence).not.toBe('insufficient')
    expect(vm.summaryMetrics.length).toBeGreaterThan(0)
    expect(vm.sections.length).toBeGreaterThan(0)
    expect(vm.futureMetrics.length).toBeGreaterThan(0)
  })

  it('requiresDataset 지표는 ready가 아님', () => {
    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    const datasetFuture = vm.futureMetrics.filter((m) => m.availability === 'requiresDataset')
    expect(datasetFuture.every((m) => m.status === 'future')).toBe(true)
    expect(datasetFuture.every((m) => m.formattedValue === '데이터 축적 후 제공')).toBe(true)
  })

  it('requiresMatchDetail 지표는 실제값처럼 표시되지 않음', () => {
    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    const teamFuture = vm.futureMetrics.filter((m) => m.availability === 'requiresMatchDetail')
    expect(teamFuture.length).toBeGreaterThan(0)
    for (const metric of teamFuture) {
      expect(metric.status).toBe('future')
      expect(metric.value).toBeNull()
      expect(metric.formattedValue).toBe('상세 경기 데이터 필요')
    }
  })

  it('백분위·SSS 문자열이 생성되지 않음', () => {
    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    const allText = [
      ...vm.summaryMetrics,
      ...vm.sections.flatMap((s) => s.metrics),
      ...vm.futureMetrics,
    ]
      .map((m) => m.formattedValue)
      .join(' ')

    expect(allText).not.toMatch(/SSS/i)
    expect(allText).not.toMatch(/샘플\s*상위/)
    expect(allText).not.toMatch(/상위\s*[\d.]+\s*%/)
  })

  it('표본 부족 시 partial/insufficient', () => {
    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis: null,
      analysisReport: null,
      analysisMatches: [],
      basisLabel: 'test',
    })

    expect(vm.dataConfidence).toBe('insufficient')
    const sampleMetric = vm.summaryMetrics.find((m) => m.id === 'sampleSize')
    expect(sampleMetric?.formattedValue).toBe('0')
  })

  it('20판 미만일 때 medium confidence', () => {
    const matches = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20').slice(0, 5)
    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      analysisMatches: matches,
      basisLabel: 'test',
    })

    expect(vm.dataConfidence).toBe('medium')
  })

  it('역할 추정은 약한 표현', () => {
    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis: getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20'),
      analysisReport: getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20'),
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20'),
      basisLabel: 'test',
    })

    if (vm.estimatedTendency) {
      expect(vm.estimatedTendency).toMatch(/^추정 역할군:/)
    }
  })

  it('역할군 보류 상태는 보수적인 문구로 표시', () => {
    const playStyleAnalysis: PlayerPlayStyleAnalysis = {
      status: 'ok',
      sampleSize: 10,
      axisScores: { survival: 50, combat: 50, macro: 50, support: 50, clutch: 50 },
      tierAverageAxes: {},
      roleFitScores: { dealer: 50, bruiser: 50, support: 50, tank: 50, assassin: 50 },
      primaryRole: null,
      secondaryRole: null,
      roleConfidence: 'low',
      roleReasonSummary: '분석 보류',
      unavailableMetrics: [],
      overallScore: 50,
      strengths: [],
      improvements: [],
      comment: '최근 10경기 기준 플레이 경향: 분석 보류',
      chartData: [
        { subject: '생존', axis: 'survival', value: 50, tierAvg: 50, fullMark: 100 },
        { subject: '교전', axis: 'combat', value: 50, tierAvg: 50, fullMark: 100 },
        { subject: '운영', axis: 'macro', value: 50, tierAvg: 50, fullMark: 100 },
      ],
      basisLabel: '최근 10경기 기준',
    }

    const vm = buildPlayerAnalysisViewModel({
      playStyleAnalysis,
      analysisReport: null,
      analysisMatches: getDemoAnalysisMatchesForSeason('마인', 11, 'recent20').slice(0, 10),
      basisLabel: '최근 경기 분석: 현재 로드된 10경기 기준',
    })

    expect(vm.insightLine).toBe('최근 10경기 기준 플레이 경향은 여러 역할군이 비슷해 추정을 보류합니다.')
    expect(vm.rolePrimaryLabel).toBeNull()
  })
})
