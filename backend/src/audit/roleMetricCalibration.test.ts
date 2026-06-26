import { describe, expect, it } from 'vitest'

import {
  analyzeProtectAbsorb,
  buildCalibrationReport,
  computeMetricEffectiveStats,
  resolveEffectiveReadiness,
  toCalibrationRow,
} from './roleMetricCalibration.js'

type CalibrationInput = Parameters<typeof toCalibrationRow>[0]

function row(overrides: Partial<CalibrationInput> = {}): ReturnType<typeof toCalibrationRow> {
  return toCalibrationRow({
    gameId: 'g1',
    uid: 'uid-test',
    characterNum: 73,
    bestWeapon: 24,
    rpAfter: 2500,
    displaySeasonId: 11,
    deaths: 1,
    kills: 0,
    assists: 5,
    teamKills: 10,
    damageToPlayer: 5000,
    victory: true,
    placement: 2,
    gameDuration: 1200,
    playedAt: new Date('2026-06-01T00:00:00Z'),
    damageFromPlayer: 8000,
    protectAbsorb: 1000,
    shieldDamageOffsetFromPlayer: 1000,
    teamRecover: 5000,
    ccTimeToPlayer: 40,
    viewContribution: 20,
    monsterKill: 10,
    ...overrides,
  })
}

describe('roleMetricCalibration', () => {
  it('effective readiness uses positive sample thresholds', () => {
    expect(resolveEffectiveReadiness(35, 5)).toBe('unusable')
    expect(resolveEffectiveReadiness(35, 12)).toBe('experimental')
    expect(resolveEffectiveReadiness(150, 40)).toBe('provisional')
    expect(resolveEffectiveReadiness(350, 120)).toBe('ready')
  })

  it('0 값을 유효하게 집계', () => {
    const stats = computeMetricEffectiveStats(
      [row({ teamRecover: 0 }), row({ teamRecover: 100 }), row({ teamRecover: 0 })],
      'teamRecover',
    )
    expect(stats.zeroCount).toBe(2)
    expect(stats.positiveCount).toBe(1)
    expect(stats.zeroIsNormal).toBe(true)
  })

  it('protectAbsorb exact match 분석', () => {
    const analysis = analyzeProtectAbsorb([
      row({ protectAbsorb: 100, shieldDamageOffsetFromPlayer: 100 }),
      row({ protectAbsorb: 200, shieldDamageOffsetFromPlayer: 150 }),
    ])
    expect(analysis.exactMatchCount).toBe(1)
    expect(analysis.pearson).not.toBeNull()
  })

  it('per-minute available when gameDuration present', () => {
    const report = buildCalibrationReport([row({ gameDuration: 600 })])
    expect(report.perMinute.available).toBe(true)
    expect(report.perMinute.fieldUsed).toBe('gameDuration')
  })

  it('PII 없이 uidHash만 사용', () => {
    const cal = toCalibrationRow({
      gameId: 'g1',
      uid: 'secret-nickname-uid',
      characterNum: 73,
      bestWeapon: 24,
      rpAfter: 2500,
      displaySeasonId: 11,
      deaths: 1,
      kills: 0,
      assists: 0,
      teamKills: 0,
      damageToPlayer: 0,
      victory: false,
      placement: 5,
      gameDuration: null,
      playedAt: new Date(),
      damageFromPlayer: null,
      protectAbsorb: null,
      shieldDamageOffsetFromPlayer: null,
      teamRecover: null,
      ccTimeToPlayer: null,
      viewContribution: null,
      monsterKill: null,
    })
    expect(cal.uidHash).not.toContain('secret')
    expect(cal.uidHash.startsWith('uid_')).toBe(true)
  })

  it('percentile stats populated', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ damageFromPlayer: (i + 1) * 100 }),
    )
    const stats = computeMetricEffectiveStats(rows, 'damageFromPlayer')
    expect(stats.median).not.toBeNull()
    expect(stats.p95).not.toBeNull()
  })
})
