import { describe, expect, it } from 'vitest'

import type { CharacterGradeRole } from '../../services/characterPerformanceGrade/config.js'
import {
  analyzeTeamKillMeaning,
  computeCombatContributionRatio,
  computeShadowRoleScore,
  deathsPer10m,
  durationBucket,
  perMinute,
  placementBucket,
  sumShadowRoleWeights,
  TEAM_LUCK_ROLE_SCORE_SHADOW_WEIGHTS,
} from './teamLuckRoleScoreV2.js'

describe('team luck role score shadow v1', () => {
  it('역할별 신규 가중치 합계는 100이다', () => {
    for (const role of Object.keys(TEAM_LUCK_ROLE_SCORE_SHADOW_WEIGHTS) as CharacterGradeRole[]) {
      expect(sumShadowRoleWeights(role)).toBe(100)
    }
  })

  it('teamKill 0 이하이면 교전 기여를 0점으로 만들지 않고 미집계한다', () => {
    expect(computeCombatContributionRatio({ playerKill: 1, playerAssistant: 2, teamKill: 0 })).toBeNull()
    expect(computeCombatContributionRatio({ playerKill: 1, playerAssistant: 2, teamKill: -1 })).toBeNull()
  })

  it('교전 기여는 개인 킬+어시스트를 팀 킬로 나누고 1을 상한으로 둔다', () => {
    expect(computeCombatContributionRatio({ playerKill: 2, playerAssistant: 3, teamKill: 10 })).toBe(0.41)
    expect(computeCombatContributionRatio({ playerKill: 8, playerAssistant: 8, teamKill: 10 })).toBe(1)
  })

  it('짧은 경기 총량 과소평가와 분당 과대평가를 혼합 점수로 완화한다', () => {
    const baseline = {
      damageToPlayer: 12000,
      damageToPlayerPerMinute: 600,
      combatContribution: 0.5,
      deathsPer10m: 1,
      visionScore: 30,
      visionScorePerMinute: 1.5,
      monsterKill: 50,
      monsterKillPerMinute: 2.5,
    }
    const short = computeShadowRoleScore({
      role: '평타 딜러',
      damageToPlayer: 9000,
      damageToPlayerPerMinute: 900,
      combatContribution: 0.5,
      deathsPer10m: 1,
      visionScore: 20,
      visionScorePerMinute: 2,
      monsterKill: 35,
      monsterKillPerMinute: 3.5,
    }, baseline)
    const long = computeShadowRoleScore({
      role: '평타 딜러',
      damageToPlayer: 15000,
      damageToPlayerPerMinute: 500,
      combatContribution: 0.5,
      deathsPer10m: 1,
      visionScore: 40,
      visionScorePerMinute: 1.3,
      monsterKill: 65,
      monsterKillPerMinute: 2.2,
    }, baseline)

    expect(short.score).not.toBeNull()
    expect(long.score).not.toBeNull()
    expect(Math.abs((short.score ?? 0) - (long.score ?? 0))).toBeLessThan(20)
  })

  it('placementBucket과 durationBucket은 shadow residual 조건으로 유지한다', () => {
    expect(placementBucket(1)).toBe('place-1')
    expect(placementBucket(8)).toBe('place-7-plus')
    expect(durationBucket(14 * 60)).toBe('duration-lt-15m')
    expect(durationBucket(26 * 60)).toBe('duration-25-30m')
  })

  it('deathsPer10m와 perMinute 계산', () => {
    expect(deathsPer10m(2, 1200)).toBe(1)
    expect(perMinute(12000, 1200)).toBe(600)
  })

  it('같은 경기·같은 팀의 teamKill 공유 여부를 집계한다', () => {
    const report = analyzeTeamKillMeaning([
      { gameId: 'a', teamNumber: 1, teamKill: 10, playerKill: 2, playerAssistant: 3 },
      { gameId: 'a', teamNumber: 1, teamKill: 10, playerKill: 1, playerAssistant: 4 },
      { gameId: 'a', teamNumber: 2, teamKill: 6, playerKill: 3, playerAssistant: 1 },
      { gameId: 'a', teamNumber: 2, teamKill: 6, playerKill: 1, playerAssistant: 2 },
      { gameId: 'b', teamNumber: 1, teamKill: 4, playerKill: 4, playerAssistant: 0 },
      { gameId: 'b', teamNumber: 1, teamKill: 4, playerKill: 0, playerAssistant: 1 },
    ])

    expect(report.sameTeamUniformRatio).toBe(1)
    expect(report.differentTeamDifferentRatio).toBe(1)
    expect(report.equalsKillAssistRatio).toBeLessThan(0.5)
  })
})
