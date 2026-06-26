import { describe, expect, it } from 'vitest'

import { computeMatchGradeV3 } from '../../services/roleScore/roleScoreV3.js'
import {
  buildDamageShadowEvaluation,
  computeShadowExpectedDamage,
  normalizeDamageScore,
  resolveDamageCurveMultiplier,
  type DamageShadowPlayerMatchRow,
} from './damageShadowEvaluator.js'
import type { RoleTimeCurveCandidateV11 } from './roleTimeCurveV11.js'

function fakeCandidate(multiplierAt25 = 1.25): RoleTimeCurveCandidateV11 {
  return {
    version: 'role-time-curve.v1.1',
    previousVersion: 'role-time-curve.v1',
    status: 'candidate',
    generatedAt: '2026-01-01T00:00:00.000Z',
    source: 'PlayerMatch',
    runtimeApplied: false,
    modes: ['rank'],
    seasons: [6],
    anchorsMinutes: [0, 5, 10, 15, 20, 25, 30],
    metrics: ['damageToPlayer'],
    roles: ['평타 딜러', '스증 딜러', '암살자', '브루저', '탱커', '유틸 서포터', 'unknown'],
    anchorShrinkK: 30,
    outlierMethod: 'p95-winsorized-mean',
    monotonicCorrection: 'weighted-isotonic-regression',
    thirtyMinutePolicy: 'carry-forward-25m-when-30plus-empty',
    shortGamePolicy: 'exclude-under-8m-from-curve-training',
    normalization: { method: 'test', targetAverageMultiplier: 1 },
    notes: [],
    warnings: [],
    curves: {
      '평타 딜러': metricMap('평타 딜러', multiplierAt25),
      '스증 딜러': metricMap('스증 딜러', multiplierAt25),
      암살자: metricMap('암살자', multiplierAt25),
      브루저: metricMap('브루저', multiplierAt25),
      탱커: metricMap('탱커', multiplierAt25),
      '유틸 서포터': metricMap('유틸 서포터', multiplierAt25),
      unknown: metricMap('unknown', multiplierAt25),
    },
  }
}

function metricMap(role: RoleTimeCurveCandidateV11['roles'][number], multiplierAt25: number) {
  return {
    damageToPlayer: curve(role, multiplierAt25, 'damageToPlayer'),
    viewContribution: curve(role, multiplierAt25, 'viewContribution'),
    monsterKill: curve(role, multiplierAt25, 'monsterKill'),
  }
}

function curve(
  role: RoleTimeCurveCandidateV11['roles'][number],
  multiplierAt25: number,
  metric: 'damageToPlayer' | 'viewContribution' | 'monsterKill',
) {
  return {
    metric,
    role,
    anchorShrinkK: 30,
    normalizer: 1,
    warnings: [],
    points: [
      point(0, 0),
      point(5, 0),
      point(10, 0.5),
      point(15, 0.75),
      point(20, 1),
      point(25, multiplierAt25),
      point(30, 2),
    ],
  }
}

function point(minute: number, normalizedMultiplier: number) {
  return {
    minute,
    absoluteExpectedValue: 999999,
    preNormalizationValue: 999999,
    normalizedMultiplier,
    rawObservedValue: null,
    globalFallbackValue: 999999,
    blendedValue: 999999,
    anchorSampleCount: 10,
    globalSampleCount: 10,
    anchorWeight: 0.5,
    globalWeight: 0.5,
    source: 'blended' as const,
    warnings: [],
  }
}

const fixtureRow: DamageShadowPlayerMatchRow = {
  uid: 'test-uid',
  gameId: 'test-game',
  apiSeasonId: 6,
  displaySeasonId: 6,
  gameMode: 'rank',
  playedAt: new Date('2026-01-01T00:00:00.000Z'),
  characterNum: 60,
  bestWeapon: 6,
  placement: 1,
  kills: 12,
  deaths: 5,
  assists: 6,
  teamKills: 23,
  victory: true,
  rpAfter: 9000,
  gameDuration: 1422,
  damageToPlayer: 38613,
  viewContribution: 52,
  monsterKill: 46,
}

describe('damageShadowEvaluator', () => {
  it('normalizedMultiplier는 선형 보간하고 candidate 절대값을 기준값으로 쓰지 않는다', () => {
    const resolved = resolveDamageCurveMultiplier({
      role: '스증 딜러',
      durationSeconds: 12 * 60,
      policy: 'A_INTERPOLATE_25_30',
      fallbackMultiplier: 1,
      candidateOverride: fakeCandidate(),
    })

    expect(resolved.multiplier).toBeCloseTo(0.6, 6)
    expect(computeShadowExpectedDamage(10000, resolved.multiplier)).toBeCloseTo(6000, 4)
  })

  it('8분 미만과 30분 초과는 기존 multiplier fallback을 쓴다', () => {
    const under = resolveDamageCurveMultiplier({
      role: '스증 딜러',
      durationSeconds: 7 * 60,
      policy: 'A_INTERPOLATE_25_30',
      fallbackMultiplier: 0.77,
      candidateOverride: fakeCandidate(),
    })
    const over = resolveDamageCurveMultiplier({
      role: '스증 딜러',
      durationSeconds: 31 * 60,
      policy: 'A_INTERPOLATE_25_30',
      fallbackMultiplier: 1.44,
      candidateOverride: fakeCandidate(),
    })

    expect(under.multiplier).toBe(0.77)
    expect(under.fallbackReason).toBe('under-8m')
    expect(over.multiplier).toBe(1.44)
    expect(over.fallbackReason).toBe('over-30m')
  })

  it('25~30분 정책 A는 보간, B는 25분 고정을 사용한다', () => {
    const a = resolveDamageCurveMultiplier({
      role: '스증 딜러',
      durationSeconds: 28 * 60,
      policy: 'A_INTERPOLATE_25_30',
      fallbackMultiplier: 1,
      candidateOverride: fakeCandidate(1.25),
    })
    const b = resolveDamageCurveMultiplier({
      role: '스증 딜러',
      durationSeconds: 28 * 60,
      policy: 'B_HOLD_25',
      fallbackMultiplier: 1,
      candidateOverride: fakeCandidate(1.25),
    })

    expect(a.multiplier).toBeCloseTo(1.7, 6)
    expect(b.multiplier).toBeCloseTo(1.25, 6)
  })

  it('기존 ratio-to-score 변환을 재사용하고 NaN을 만들지 않는다', () => {
    expect(normalizeDamageScore(12000, 10000)).toBeCloseTo(74, 4)
    expect(normalizeDamageScore(null, 10000)).toBeNull()
    expect(normalizeDamageScore(12000, null)).toBeNull()
  })

  it('shadow 평가는 production match grade 결과를 변경하지 않는다', () => {
    const input = {
      tierKey: 'mithril_plus' as const,
      characterNum: fixtureRow.characterNum,
      weaponTypeId: fixtureRow.bestWeapon,
      role: '스증 딜러' as const,
      placement: fixtureRow.placement,
      durationSeconds: fixtureRow.gameDuration,
      damageToPlayer: fixtureRow.damageToPlayer,
      kills: fixtureRow.kills,
      assists: fixtureRow.assists,
      teamKills: fixtureRow.teamKills,
      deaths: fixtureRow.deaths,
      visionScore: fixtureRow.viewContribution,
      monsterKill: fixtureRow.monsterKill,
    }
    const before = computeMatchGradeV3(input)
    const { report } = buildDamageShadowEvaluation([fixtureRow], '2026-01-01T00:00:00.000Z')
    const after = computeMatchGradeV3(input)

    expect(report.runtimeApplied).toBe(false)
    expect(report.sample.evaluatedRows).toBe(1)
    expect(after).toEqual(before)
  })
})
