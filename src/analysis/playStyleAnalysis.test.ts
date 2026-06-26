import { describe, expect, it } from 'vitest'

import {
  buildPlayStyleAnalysis,
  computeRoleFitScores,
  ROLE_AXIS_WEIGHTS,
} from '@/analysis/playStyleAnalysis'
import { deriveMatchSetMetrics } from '@/analysis/playStyleMetrics'
import { ANALYSIS_AXES, PLAYER_ROLES } from '@/analysis/playStyleTypes'
import { getDemoAnalysisMatchesForSeason, getDemoPlayStyleAnalysisForSeason } from '@/mocks/loader'
import type { MatchSummary } from '@/types/match'

function cloneMatch(base: MatchSummary, patch: Partial<MatchSummary>): MatchSummary {
  return { ...base, ...patch }
}

function buildPopulationFrom(baseMatches: MatchSummary[]): MatchSummary[][] {
  return [baseMatches, baseMatches.map((m, i) => cloneMatch(m, { placement: m.placement + (i % 3) }))]
}

describe('playStyleAnalysis', () => {
  it('포지션별 축 가중치 합이 100', () => {
    for (const role of PLAYER_ROLES) {
      const sum = ANALYSIS_AXES.reduce((acc, axis) => acc + ROLE_AXIS_WEIGHTS[role][axis], 0)
      expect(sum).toBe(100)
    }
  })

  it('레이더 축 점수는 포지션 축 가중치를 직접 곱하지 않는다', () => {
    const base = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')
    expect(base.length).toBeGreaterThanOrEqual(3)

    const report = buildPlayStyleAnalysis({
      playerMatches: base,
      populationMatchSets: buildPopulationFrom(base),
      basisLabel: 'test',
    })
    expect(report.status).toBe('ok')

    const rawSurvival = report.axisScores.survival
    expect(rawSurvival).toBeDefined()
    expect(rawSurvival).toBeGreaterThanOrEqual(0)
    expect(rawSurvival).toBeLessThanOrEqual(100)

    const weightedByTank = ANALYSIS_AXES.reduce((sum, axis) => {
      const score = report.axisScores[axis] ?? 0
      return sum + score * (ROLE_AXIS_WEIGHTS.tank[axis] / 100)
    }, 0)
    expect(report.axisScores.survival).not.toBeCloseTo(weightedByTank, 0)
  })

  it('역할 적합도에는 포지션 축 가중치가 적용된다', () => {
    const axisScores = {
      survival: 80,
      combat: 60,
      macro: 50,
      support: 40,
      finish: 70,
      consistency: 55,
    }
    const fit = computeRoleFitScores(axisScores)
    const tankFit =
      (80 * 30 + 60 * 10 + 50 * 15 + 40 * 30 + 70 * 5 + 55 * 10) / 100
    expect(fit.tank).toBeCloseTo(tankFit, 1)
  })

  it('평균 등수가 낮을수록 생존 점수가 높아진다', () => {
    const template = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')[0]!
    const good = Array.from({ length: 5 }, (_, i) =>
      cloneMatch(template, { matchId: `good-${i}`, placement: 2 }),
    )
    const bad = Array.from({ length: 5 }, (_, i) =>
      cloneMatch(template, { matchId: `bad-${i}`, placement: 8 }),
    )
    const population = buildPopulationFrom(good)

    const goodReport = buildPlayStyleAnalysis({ playerMatches: good, populationMatchSets: population })
    const badReport = buildPlayStyleAnalysis({ playerMatches: bad, populationMatchSets: population })

    expect(goodReport.axisScores.survival).toBeGreaterThan(badReport.axisScores.survival ?? 0)
  })

  it('평균 데스·하위권·일관성 변동은 역산된다', () => {
    const template = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')[0]!
    const stable = Array.from({ length: 6 }, (_, i) =>
      cloneMatch(template, { matchId: `stable-${i}`, deaths: 2, placement: 4 }),
    )
    const volatile = Array.from({ length: 6 }, (_, i) =>
      cloneMatch(template, {
        matchId: `volatile-${i}`,
        deaths: i % 2 === 0 ? 1 : 8,
        placement: i % 2 === 0 ? 2 : 9,
        kills: i % 2 === 0 ? 8 : 1,
        assists: 2,
      }),
    )
    const population = buildPopulationFrom(stable)

    const stableReport = buildPlayStyleAnalysis({ playerMatches: stable, populationMatchSets: population })
    const volatileReport = buildPlayStyleAnalysis({ playerMatches: volatile, populationMatchSets: population })

    expect(stableReport.axisScores.consistency).toBeGreaterThan(
      volatileReport.axisScores.consistency ?? 0,
    )
  })

  it('마무리 점수에 평균 등수 20%가 반영된다 — 같은 승률이면 등수 좋은 쪽이 높다', () => {
    const template = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')[0]!
    const build = (placement: number) =>
      Array.from({ length: 5 }, (_, i) =>
        cloneMatch(template, { matchId: `finish-${placement}-${i}`, placement, victory: true }),
      )
    const goodPlacement = build(2)
    const badPlacement = build(8)
    const metrics = deriveMatchSetMetrics(badPlacement)
    expect(metrics?.avgPlacement).toBe(8)
    expect(metrics?.winRate).toBe(100)

    const population = [...buildPopulationFrom(goodPlacement), ...buildPopulationFrom(badPlacement)]
    const goodReport = buildPlayStyleAnalysis({ playerMatches: goodPlacement, populationMatchSets: population })
    const badReport = buildPlayStyleAnalysis({ playerMatches: badPlacement, populationMatchSets: population })

    expect(goodReport.axisScores.finish).toBeDefined()
    expect(goodReport.axisScores.finish ?? 0).toBeGreaterThan(badReport.axisScores.finish ?? 0)
  })

  it('일부 지표 unavailable 시 가중치 재분배·NaN 없음', () => {
    const template = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')[0]!
    const sparse = Array.from({ length: 4 }, (_, i) =>
      cloneMatch(template, {
        matchId: `sparse-${i}`,
        teamKills: undefined,
        damageToPlayers: undefined,
        visionScore: undefined,
        animalKills: undefined,
        credit: undefined,
        gameDuration: undefined,
      }),
    )

    const report = buildPlayStyleAnalysis({
      playerMatches: sparse,
      populationMatchSets: buildPopulationFrom(sparse),
    })

    expect(report.status).toBe('ok')
    for (const axis of ANALYSIS_AXES) {
      const score = report.axisScores[axis]
      if (score != null) {
        expect(Number.isFinite(score)).toBe(true)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      }
    }
    expect(report.unavailableMetrics.length).toBeGreaterThan(0)
  })

  it('주·보조 역할군이 안정적으로 계산된다', () => {
    const report = getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20')
    expect(report?.status).toBe('ok')
    expect(report?.primaryRole).toBeTruthy()
    expect(report?.secondaryRole).toBeTruthy()
    expect(report?.primaryRole).not.toBe(report?.secondaryRole)
  })

  it('한국어 characterName도 역할군 분포에 반영된다', () => {
    const template = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')[0]!
    const matches = Array.from({ length: 4 }, (_, i) =>
      cloneMatch(template, {
        matchId: `ko-yuki-${i}`,
        characterName: '유키',
        characterNum: 11,
      }),
    )

    const report = buildPlayStyleAnalysis({
      playerMatches: matches,
      populationMatchSets: buildPopulationFrom(matches),
    })

    expect(report.status).toBe('ok')
    expect(report.primaryRole).toBe('basicAttackDealer')
  })

  it('마인 분석탭 데이터가 깨지지 않는다', () => {
    const report = getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20')
    expect(report).not.toBeNull()
    expect(report?.chartData.length).toBeGreaterThan(0)
    expect(report?.overallScore).toBeGreaterThanOrEqual(0)
    expect(report?.overallScore).toBeLessThanOrEqual(100)
  })
})
