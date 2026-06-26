import { describe, expect, it } from 'vitest'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { filterRowsForShadowBenchmark } from '../playerCharacterSnapshot/matchFilter.js'
import { aggregateScopedRowMetrics, sortRowsByRecency } from './aggregate.js'
import { resolveAnalysisConfidence } from './reliability.js'

const UID = 'uid-test'
const DISPLAY = 11
const API = 39

function row(gameId: string, overrides: Partial<PlayerMatchRow> = {}): PlayerMatchRow {
  return {
    id: BigInt(1),
    uid: UID,
    apiSeasonId: API,
    displaySeasonId: DISPLAY,
    gameId,
    gameMode: 'rank',
    matchingMode: 3,
    matchingTeamMode: 3,
    playedAt: new Date(`2026-06-${String(10 + Number(gameId.slice(-1))).padStart(2, '0')}T00:00:00.000Z`),
    characterNum: 1,
    characterName: 'Test',
    placement: 3,
    kills: 2,
    deaths: 1,
    assists: 1,
    teamKills: 4,
    damageToPlayer: 10000,
    victory: false,
    rpAfter: 2500,
    rpDelta: 5,
    gameDuration: 1200,
    cobaltInfusions: null,
    accountLevel: 100,
    characterLevel: 10,
    skinCode: null,
    bestWeapon: 101,
    bestWeaponLevel: 3,
    tacticalSkillGroup: null,
    tacticalSkillLevel: null,
    traitFirstCore: null,
    traitFirstSub: null,
    traitSecondSub: null,
    equipment: null,
    equipmentGrade: null,
    routeIdOfStart: null,
    routeSlotId: null,
    masteryLevel: null,
    skillLevelInfo: null,
    skillOrderInfo: null,
    rawJson: { uid: UID },
    damageFromPlayer: null,
    protectAbsorb: null,
    shieldDamageOffsetFromPlayer: null,
    teamRecover: null,
    ccTimeToPlayer: null,
    viewContribution: 20,
    monsterKill: 3,
    roleMetricsVersion: null,
    roleMetricsCapturedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('playerAnalysis aggregate invariants', () => {
  const raw = [
    row('1001', { gameMode: 'rank', characterNum: 1 }),
    row('1002', { gameMode: 'normal', characterNum: 2 }),
    row('1003', { gameMode: 'rank', characterNum: 1 }),
    row('1004', { gameMode: 'cobalt', matchingMode: 6, characterNum: 9 }),
    row('1005', { gameMode: 'union', matchingMode: 7, characterNum: 8 }),
    row('1006', { uid: 'foreign', rawJson: { uid: 'foreign' }, characterNum: 1 }),
    row('1001', { kills: 99, characterNum: 1 }),
  ]

  const filtered = filterRowsForShadowBenchmark({
    rows: raw,
    canonicalUid: UID,
    scope: 'rank',
    displaySeasonId: DISPLAY,
    apiSeasonId: API,
  })

  const allRows = filtered.rows
  const recentRows = sortRowsByRecency(allRows).slice(0, 20)

  it('includes rank only for rank scope', () => {
    expect(allRows.every((entry) => entry.gameMode === 'rank')).toBe(true)
  })

  it('excludes cobalt, union, foreign owner, duplicate gameId', () => {
    expect(filtered.stats.excludedUnsupportedMode).toBeGreaterThanOrEqual(2)
    expect(filtered.stats.excludedOwnershipMismatch).toBe(1)
    expect(filtered.stats.excludedDuplicateGameId).toBe(1)
  })

  it('character game sum equals overall games', () => {
    const byChar = new Map<number, number>()
    for (const entry of allRows) {
      byChar.set(entry.characterNum, (byChar.get(entry.characterNum) ?? 0) + 1)
    }
    const sum = [...byChar.values()].reduce((acc, value) => acc + value, 0)
    expect(sum).toBe(allRows.length)
  })

  it('recent20 count is min(total, 20)', () => {
    expect(recentRows.length).toBe(Math.min(allRows.length, 20))
  })

  it('null metrics stay null when denominator is zero', () => {
    const metrics = aggregateScopedRowMetrics({
      rows: [row('2001', { teamKills: 0, kills: 1, assists: 0 })],
      displaySeasonId: DISPLAY,
      apiSeasonId: API,
      characterNum: 1,
    })
    expect(metrics.teamKillParticipation).toBeNull()
  })

  it('confidence tiers follow 3/10/20 policy', () => {
    expect(resolveAnalysisConfidence(5)).toBe('exploratory')
    expect(resolveAnalysisConfidence(12)).toBe('provisional')
    expect(resolveAnalysisConfidence(25)).toBe('official')
  })
})
