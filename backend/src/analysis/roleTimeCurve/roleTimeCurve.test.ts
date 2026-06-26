import { describe, expect, it } from 'vitest'

import {
  applyRoleGlobalShrinkage,
  buildRoleTimeCurveCandidate,
  classifyDurationBucket,
  enforceMonotonicIncreasing,
  interpolateCurve,
  winsorizedMean,
  type RoleTimePlayerMatchRow,
} from './roleTimeCurve.js'

function row(partial: Partial<RoleTimePlayerMatchRow>): RoleTimePlayerMatchRow {
  return {
    uid: partial.uid ?? 'uid-a',
    gameId: partial.gameId ?? 'game-a',
    apiSeasonId: partial.apiSeasonId ?? 39,
    displaySeasonId: partial.displaySeasonId ?? 11,
    gameMode: partial.gameMode ?? 'rank',
    playedAt: partial.playedAt ?? new Date('2026-06-01T00:00:00.000Z'),
    characterNum: partial.characterNum ?? 1,
    bestWeapon: partial.bestWeapon ?? null,
    placement: partial.placement ?? 1,
    deaths: partial.deaths ?? 0,
    victory: partial.victory ?? false,
    rpAfter: partial.rpAfter ?? 1000,
    gameDuration: partial.gameDuration ?? 18 * 60,
    damageToPlayer: partial.damageToPlayer ?? 1000,
    viewContribution: partial.viewContribution ?? 10,
    monsterKill: partial.monsterKill ?? 20,
  }
}

describe('role-time-curve candidate utilities', () => {
  it('classifies duration buckets', () => {
    expect(classifyDurationBucket(4 * 60 + 59)).toBe('0-5')
    expect(classifyDurationBucket(5 * 60)).toBe('5-10')
    expect(classifyDurationBucket(18 * 60)).toBe('15-20')
    expect(classifyDurationBucket(30 * 60)).toBe('30+')
    expect(classifyDurationBucket(null)).toBeNull()
  })

  it('linearly interpolates 18 minute values', () => {
    expect(
      interpolateCurve(
        [
          { minute: 15, value: 100 },
          { minute: 20, value: 200 },
        ],
        18,
      ),
    ).toBe(160)
  })

  it('uses p95 winsorized mean for outlier resistance', () => {
    const value = winsorizedMean([10, 10, 10, 1000], 0.75)
    expect(value).toBe(10)
  })

  it('enforces monotonic cumulative curves', () => {
    expect(enforceMonotonicIncreasing([0, 10, 8, 20], [1, 10, 10, 10])).toEqual([0, 9, 9, 20])
  })

  it('shrinks low-sample role curves toward global and falls back on zero sample', () => {
    const shrunk = applyRoleGlobalShrinkage({
      roleCurve: [0, 100],
      globalCurve: [0, 40],
      roleSampleCount: 30,
      shrinkK: 30,
    })
    expect(shrunk.values[1]).toBe(70)
    expect(shrunk.usedGlobalFallback).toBe(false)

    const fallback = applyRoleGlobalShrinkage({
      roleCurve: [0, 999],
      globalCurve: [0, 40],
      roleSampleCount: 0,
      shrinkK: 30,
    })
    expect(fallback.values[1]).toBe(40)
    expect(fallback.usedGlobalFallback).toBe(true)
  })

  it('builds deterministic finite candidate output without applying runtime scoring', () => {
    const rows = [
      row({ gameId: 'g1', gameDuration: 8 * 60, damageToPlayer: 800, viewContribution: 8, monsterKill: 20 }),
      row({ gameId: 'g2', gameDuration: 18 * 60, damageToPlayer: 1800, viewContribution: 18, monsterKill: 35 }),
      row({ gameId: 'g3', gameDuration: 28 * 60, damageToPlayer: 2800, viewContribution: 28, monsterKill: 50 }),
      row({ gameId: 'g4', gameMode: 'cobalt', gameDuration: 30 * 60, damageToPlayer: 9999 }),
    ]
    const first = buildRoleTimeCurveCandidate(rows, { generatedAt: 'fixed', shrinkK: 30 })
    const second = buildRoleTimeCurveCandidate(rows, { generatedAt: 'fixed', shrinkK: 30 })
    expect(first).toEqual(second)
    expect(first.runtimeApplied).toBe(false)
    for (const role of first.roles) {
      for (const metric of first.metrics) {
        for (const point of first.curves[role][metric].points) {
          expect(Number.isFinite(point.finalValue)).toBe(true)
          expect(Number.isFinite(point.normalizedMultiplier)).toBe(true)
        }
      }
    }
  })
})

