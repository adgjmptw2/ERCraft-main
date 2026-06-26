import { describe, expect, it } from 'vitest'

import {
  computeAdjustedContributionV3,
  computeMatchGradeV3,
  computeRoleScoreV3,
  roleScoreV3BasePlacementAdjustment,
  roleScoreV3PlacementAdjustment,
  ROLE_SCORE_V3_VERSION,
} from './roleScoreV3.js'
import { TEAM_LUCK_ROLE_SCORE_WEIGHTS } from './teamLuckRoleScore.js'

describe('roleScoreV3', () => {
  it('역할별 가중치 합계는 100이다', () => {
    for (const weights of Object.values(TEAM_LUCK_ROLE_SCORE_WEIGHTS)) {
      expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBe(100)
    }
  })

  it('DAK.GG exact 기준선을 우선 사용한다', () => {
    const result = computeRoleScoreV3({
      tierKey: 'mithril_plus',
      characterNum: 60,
      weaponTypeId: 6,
      role: '스증 딜러',
      placement: 1,
      durationSeconds: 1422,
      damageToPlayer: 38613,
      kills: 12,
      deaths: 5,
      assists: 6,
      teamKills: 23,
      visionScore: 52,
      monsterKill: 46,
    })

    expect(result.baselineLevel).toBe('exact')
    expect(result.score).toBeGreaterThan(70)
    expect(result.missingMetrics).toEqual([])
  })

  it('exact 기준선이 없으면 DAK.GG 집계 fallback을 사용한다', () => {
    const result = computeRoleScoreV3({
      tierKey: 'mithril_plus',
      characterNum: 9999,
      weaponTypeId: 6,
      role: '스증 딜러',
      placement: 1,
      durationSeconds: 1200,
      damageToPlayer: 20000,
      kills: 5,
      deaths: 2,
      assists: 5,
      teamKills: 12,
      visionScore: 30,
      monsterKill: 40,
    })

    expect(result.baselineLevel).toBe('tier-role')
    expect(result.score).not.toBeNull()
  })

  it('짧은 경기에서는 총량 기대값이 duration multiplier로 낮아진다', () => {
    const short = computeRoleScoreV3({
      tierKey: 'mithril_plus',
      characterNum: 60,
      weaponTypeId: 6,
      role: '스증 딜러',
      placement: 1,
      durationSeconds: 700,
      damageToPlayer: 15000,
      kills: 4,
      deaths: 1,
      assists: 4,
      teamKills: 10,
      visionScore: 20,
      monsterKill: 20,
    })
    const long = computeRoleScoreV3({
      tierKey: 'mithril_plus',
      characterNum: 60,
      weaponTypeId: 6,
      role: '스증 딜러',
      placement: 1,
      durationSeconds: 1700,
      damageToPlayer: 15000,
      kills: 4,
      deaths: 1,
      assists: 4,
      teamKills: 10,
      visionScore: 20,
      monsterKill: 20,
    })

    expect(short.expectedMetrics.damageToPlayer).toBeLessThan(long.expectedMetrics.damageToPlayer ?? 0)
  })

  it('경기 등급 v3는 roleScore-aware placementAdjustment direct 계산을 사용한다', () => {
    const result = computeMatchGradeV3({
      tierKey: 'mithril_plus',
      characterNum: 60,
      weaponTypeId: 6,
      role: '스증 딜러',
      placement: 1,
      durationSeconds: 1422,
      damageToPlayer: 38613,
      kills: 12,
      deaths: 5,
      assists: 6,
      teamKills: 23,
      visionScore: 52,
      monsterKill: 46,
    })

    expect(ROLE_SCORE_V3_VERSION).toBe('role-score.v3')
    expect(result).not.toBeNull()
    expect(result?.placementAdjustment).toBeGreaterThan(0)
    expect(result?.placementAdjustment).toBeLessThanOrEqual(8)
    expect(result?.score).toBeCloseTo((result?.roleScore ?? 0) + (result?.placementAdjustment ?? 0), 2)
  })

  it('팀원 흐름 v3는 순위 효과를 제거한 adjustedContribution을 계산한다', () => {
    const first = computeAdjustedContributionV3({
      tierKey: 'mithril_plus',
      characterNum: 60,
      weaponTypeId: 6,
      role: '스증 딜러',
      placement: 1,
      durationSeconds: 1422,
      damageToPlayer: 38613,
      kills: 12,
      deaths: 5,
      assists: 6,
      teamKills: 23,
      visionScore: 52,
      monsterKill: 46,
    })

    expect(first).not.toBeNull()
    expect(first?.placementEffectFallbackLevel).toBe('role-placement')
    expect(first?.adjustedContribution).toBeCloseTo(
      (first?.roleScore ?? 0) - (first?.placementEffect ?? 0),
      4,
    )
  })

  it('rollback용 기본 순위 보정 table은 유지한다', () => {
    expect(roleScoreV3BasePlacementAdjustment(1)).toBe(6)
    expect(roleScoreV3BasePlacementAdjustment(8)).toBe(-6)
    expect(roleScoreV3BasePlacementAdjustment(9)).toBeNull()
  })

  it('1위 순위 보정은 낮은 roleScore에 gate를 적용하고 높은 roleScore에만 excellence bonus를 준다', () => {
    const cases = [
      [40, 41.2],
      [50, 52.4],
      [60, 64.8],
      [65, 71],
      [80, 86.6667],
      [85, 92.3333],
      [90, 98],
    ] as const

    for (const [roleScore, expectedFinalScore] of cases) {
      const adjustment = roleScoreV3PlacementAdjustment({ placement: 1, roleScore })
      expect(adjustment).not.toBeNull()
      expect(roleScore + (adjustment ?? 0)).toBeCloseTo(expectedFinalScore, 2)
    }
  })

  it('8위 순위 감점은 높은 roleScore일수록 부드럽게 완화된다', () => {
    const cases = [
      [50, 44],
      [60, 54],
      [65, 59.9],
      [75, 71.7],
      [80, 77.6],
      [85, 83.5],
      [90, 88.5],
    ] as const

    for (const [roleScore, expectedFinalScore] of cases) {
      const adjustment = roleScoreV3PlacementAdjustment({ placement: 8, roleScore })
      expect(adjustment).not.toBeNull()
      expect(roleScore + (adjustment ?? 0)).toBeCloseTo(expectedFinalScore, 2)
    }
  })

  it('2~7위 순위 보정은 roleScore에 대해 단조롭고 큰 점프 없이 이어진다', () => {
    for (const placement of [2, 3, 4, 5, 6, 7]) {
      let previous: number | null = null
      for (let roleScore = 0; roleScore <= 100; roleScore += 1) {
        const adjustment = roleScoreV3PlacementAdjustment({ placement, roleScore })
        expect(adjustment).not.toBeNull()
        const finalScore = roleScore + (adjustment ?? 0)
        if (previous != null) {
          expect(finalScore).toBeGreaterThanOrEqual(previous)
          expect(finalScore - previous).toBeLessThanOrEqual(1.25)
        }
        previous = finalScore
      }
    }
  })

  it('최종 경기 점수는 0~100으로 clamp된다', () => {
    const low = roleScoreV3PlacementAdjustment({ placement: 8, roleScore: 0 })
    const high = roleScoreV3PlacementAdjustment({ placement: 1, roleScore: 100 })

    expect(Math.max(0, Math.min(100, 0 + (low ?? 0)))).toBe(0)
    expect(Math.max(0, Math.min(100, 100 + (high ?? 0)))).toBe(100)
  })
})
