import { describe, expect, it } from 'vitest'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { filterRowsForShadowBenchmark } from '../playerCharacterSnapshot/matchFilter.js'
import { aggregateScopedRowMetrics, sortRowsByRecency } from './aggregate.js'
import { buildSourceFingerprint } from '../playerCharacterSnapshot/fingerprint.js'

const UID = 'uid-rank-only'
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

describe('rank-only analysis invariants', () => {
  const raw = [
    ...Array.from({ length: 20 }, (_, index) =>
      row(`R${String(index).padStart(3, '0')}`, { gameMode: 'rank', characterNum: 1 }),
    ),
    ...Array.from({ length: 30 }, (_, index) =>
      row(`N${String(index).padStart(3, '0')}`, { gameMode: 'normal', characterNum: 2 }),
    ),
    row('C001', { gameMode: 'cobalt', matchingMode: 6 }),
    row('U001', { gameMode: 'union', matchingMode: 7 }),
  ]

  const filtered = filterRowsForShadowBenchmark({
    rows: raw,
    canonicalUid: UID,
    scope: 'rank',
    displaySeasonId: DISPLAY,
    apiSeasonId: API,
  })

  const allRows = sortRowsByRecency(filtered.rows)
  const recentRows = allRows.slice(0, 20)

  it('rank 20 + normal 30 => overall analysis 20', () => {
    expect(allRows).toHaveLength(20)
    expect(allRows.every((entry) => entry.gameMode === 'rank')).toBe(true)
  })

  it('recent20 uses latest rank rows only', () => {
    expect(recentRows).toHaveLength(20)
    expect(recentRows.every((entry) => entry.gameMode === 'rank')).toBe(true)
  })

  it('normal additions do not change rank fingerprint', () => {
    const rankOnly = filterRowsForShadowBenchmark({
      rows: raw.filter((entry) => entry.gameMode === 'rank'),
      canonicalUid: UID,
      scope: 'rank',
      displaySeasonId: DISPLAY,
      apiSeasonId: API,
    })
    const withExtraNormal = filterRowsForShadowBenchmark({
      rows: [
        ...raw.filter((entry) => entry.gameMode === 'rank'),
        row('N999', { gameMode: 'normal', characterNum: 9 }),
      ],
      canonicalUid: UID,
      scope: 'rank',
      displaySeasonId: DISPLAY,
      apiSeasonId: API,
    })
    const fpA = buildSourceFingerprint(rankOnly.rows.map((entry) => entry.gameId))
    const fpB = buildSourceFingerprint(withExtraNormal.rows.map((entry) => entry.gameId))
    expect(fpA).toBe(fpB)
  })

  it('character game sum equals overall rank games', () => {
    const byChar = new Map<number, number>()
    for (const entry of allRows) {
      byChar.set(entry.characterNum, (byChar.get(entry.characterNum) ?? 0) + 1)
    }
    const sum = [...byChar.values()].reduce((acc, value) => acc + value, 0)
    expect(sum).toBe(allRows.length)
  })

  it('rank 16 yields provisional sample confidence', () => {
    const sixteen = sortRowsByRecency(
      filterRowsForShadowBenchmark({
        rows: Array.from({ length: 16 }, (_, index) =>
          row(`S${index}`, { gameMode: 'rank', characterNum: 1 }),
        ),
        canonicalUid: UID,
        scope: 'rank',
        displaySeasonId: DISPLAY,
        apiSeasonId: API,
      }).rows,
    )
    const metrics = aggregateScopedRowMetrics({
      rows: sixteen,
      displaySeasonId: DISPLAY,
      apiSeasonId: API,
    })
    expect(metrics.games).toBe(16)
  })
})