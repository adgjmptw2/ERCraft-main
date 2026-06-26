import { describe, expect, it } from 'vitest'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import {
  buildProductionAnalysisAxesForRows,
  computeProductionConsistencyScore,
  PRODUCTION_ANALYSIS_REFERENCE_SCORE,
} from './productionAnalysisAxes.js'

function row(index: number, patch: Partial<PlayerMatchRow> = {}): PlayerMatchRow {
  return {
    id: BigInt(index),
    uid: 'uid',
    gameId: `game-${index}`,
    apiSeasonId: 39,
    displaySeasonId: 11,
    gameMode: 'rank',
    characterNum: 1,
    characterName: '재키',
    placement: 3,
    kills: 3,
    deaths: 2,
    assists: 6,
    teamKills: 12,
    damageToPlayer: 18000,
    bestWeapon: 14,
    victory: false,
    gameDuration: 1200,
    roleMetricsVersion: 1,
    viewContribution: 45,
    monsterKill: 80,
    damageFromPlayer: null,
    shieldDamageOffsetFromPlayer: null,
    teamRecover: null,
    rawJson: null,
    playedAt: new Date(`2026-06-${String(index).padStart(2, '0')}T00:00:00.000Z`),
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    rpAfter: null,
    rpDelta: null,
    accountLevel: null,
    characterLevel: null,
    skinCode: null,
    tacticalSkillGroup: null,
    traitFirstCore: null,
    traitFirstSub: null,
    traitSecondSub: null,
    equipment: null,
    equipmentGrade: null,
    routeIdOfStart: null,
    routeSlotId: null,
    cobaltInfusions: null,
    ...patch,
  } as PlayerMatchRow
}

describe('productionAnalysisAxes', () => {
  it('creates the production-aligned six axes in fixed order', () => {
    const axes = buildProductionAnalysisAxesForRows({
      rows: Array.from({ length: 6 }, (_, index) => row(index + 1)),
      playerTier: getRankTierFromRp(6200),
      displaySeasonId: 11,
      scope: 'character',
    })

    expect(axes.axes.map((axis) => axis.axis)).toEqual([
      'survival',
      'combat',
      'macro',
      'support',
      'finish',
      'consistency',
    ])
    expect(axes.axes.every((axis) => axis.referenceScore === PRODUCTION_ANALYSIS_REFERENCE_SCORE)).toBe(true)
    expect(axes.axes.find((axis) => axis.axis === 'combat')?.components.map((row) => row.metric)).toEqual([
      'damage',
      'combatContribution',
    ])
    expect(axes.axes.find((axis) => axis.axis === 'macro')?.components[0]?.metric).toBe('monster')
    expect(axes.axes.find((axis) => axis.axis === 'support')?.components[0]?.metric).toBe('vision')
  })

  it('reuses character robust match weights from the production aggregate constants', () => {
    const axes = buildProductionAnalysisAxesForRows({
      rows: Array.from({ length: 10 }, (_, index) =>
        row(index + 1, { damageToPlayer: 8000 + index * 2000 }),
      ),
      playerTier: getRankTierFromRp(6200),
      displaySeasonId: 11,
      scope: 'character',
    })

    expect(axes.aggregationPolicy).toBe('production-character-robust-weighted-10pct')
    expect(axes.sampleCount).toBe(10)
  })

  it('does not emit NaN or Infinity for missing evidence', () => {
    const axes = buildProductionAnalysisAxesForRows({
      rows: [row(1, { bestWeapon: null })],
      playerTier: getRankTierFromRp(6200),
      displaySeasonId: 11,
      scope: 'overall',
    })

    expect(axes.axes).toHaveLength(6)
    for (const axis of axes.axes) {
      if (axis.score != null) expect(Number.isFinite(axis.score)).toBe(true)
      for (const component of axis.components) {
        if (component.score != null) expect(Number.isFinite(component.score)).toBe(true)
      }
    }
  })

  it('computes consistency from the production match scores without touching grade cuts', () => {
    expect(computeProductionConsistencyScore([70, 70, 70])).toBe(100)
    expect(computeProductionConsistencyScore([40, 70, 100]) ?? 0).toBeLessThan(100)
    expect(computeProductionConsistencyScore([70])).toBeNull()
  })
})
