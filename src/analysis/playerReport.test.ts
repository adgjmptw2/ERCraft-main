import { describe, expect, it } from 'vitest'

import {
  buildPlayerAnalysisReport,
  buildPopulationMetricsFromMatches,
} from '@/analysis/playerReport'
import type { MatchSummary } from '@/types/match'

function makeMatch(overrides: Partial<MatchSummary> & Pick<MatchSummary, 'userNum'>): MatchSummary {
  return {
    matchId: `m-${overrides.userNum}-${Math.random()}`,
    characterName: 'Yuki',
    placement: 5,
    kills: 3,
    deaths: 3,
    assists: 2,
    gameStartedAt: '2026-04-01T00:00:00.000Z',
    victory: false,
    ...overrides,
  }
}

describe('buildPlayerAnalysisReport', () => {
  const populationMatches: MatchSummary[] = [
    ...Array.from({ length: 4 }, (_, i) =>
      makeMatch({ userNum: 1, placement: 2 + i, kills: 6, assists: 4, victory: true }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makeMatch({ userNum: 2, placement: 5 + i, kills: 2, assists: 1 }),
    ),
    ...Array.from({ length: 3 }, () =>
      makeMatch({ userNum: 3, placement: 8, kills: 1, assists: 0 }),
    ),
  ]

  const population = buildPopulationMetricsFromMatches(populationMatches)

  it('정상 mock 데이터에서 report 생성', () => {
    const playerMatches = populationMatches.filter((m) => m.userNum === 1)
    const report = buildPlayerAnalysisReport({
      nickname: 'test',
      playerMatches,
      populationMetrics: population,
    })
    expect(report.status).toBe('ok')
    expect(report.metrics.length).toBeGreaterThan(0)
    expect(report.baselineLabel).toBe('데모 평균')
  })

  it('playerMatches 부족 시 insufficient', () => {
    const report = buildPlayerAnalysisReport({
      nickname: 'test',
      playerMatches: populationMatches.filter((m) => m.userNum === 1).slice(0, 2),
      populationMetrics: population,
    })
    expect(report.status).toBe('insufficient')
    expect(report.overallGrade).toBeNull()
  })

  it('빈 population에서 예외 없이 insufficient', () => {
    const report = buildPlayerAnalysisReport({
      nickname: 'test',
      playerMatches: populationMatches.filter((m) => m.userNum === 1),
      populationMetrics: [],
    })
    expect(report.status).toBe('insufficient')
  })

  it('정상 report에 종합 등급 포함', () => {
    const playerMatches = populationMatches.filter((m) => m.userNum === 1)
    const report = buildPlayerAnalysisReport({
      nickname: 'test',
      playerMatches,
      populationMetrics: population,
    })
    expect(report.overallGrade).not.toBeNull()
  })
})

describe('buildPopulationMetricsFromMatches', () => {
  it('3경기 미만 유저는 제외', () => {
    const matches = [
      makeMatch({ userNum: 10 }),
      makeMatch({ userNum: 10 }),
      makeMatch({ userNum: 11 }),
    ]
    const pop = buildPopulationMetricsFromMatches(matches)
    expect(pop).toHaveLength(0)
  })
})
