import { describe, expect, it } from 'vitest'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { buildSourceFingerprint } from './fingerprint.js'
import { filterRowsForShadowBenchmark } from './matchFilter.js'
import {
  aggregatePlayerCharacterSnapshot,
  meetsExploratoryMinimum,
  resolveSampleStatus,
} from './metrics.js'
import { percentileRankMidrank, resolvePercentileCapability } from './percentile.js'
import { assignShadowGradeFromPercentile } from './gradeDistribution.js'
import { BENCHMARK_ELIGIBLE_MIN_MATCHES, EXPLORATORY_MIN_MATCHES } from './config.js'

const CANONICAL_UID = 'uid-canonical'
const FOREIGN_UID = 'uid-foreign'
const DISPLAY_SEASON = 11
const API_SEASON = 39

function baseRow(overrides: Partial<PlayerMatchRow> = {}): PlayerMatchRow {
  return {
    id: BigInt(1),
    uid: CANONICAL_UID,
    apiSeasonId: API_SEASON,
    displaySeasonId: DISPLAY_SEASON,
    gameId: '1001',
    gameMode: 'rank',
    matchingMode: 3,
    matchingTeamMode: 3,
    playedAt: new Date('2026-06-01T00:00:00.000Z'),
    characterNum: 1,
    characterName: 'Test',
    placement: 3,
    kills: 2,
    deaths: 1,
    assists: 4,
    teamKills: 6,
    damageToPlayer: 12000,
    victory: false,
    rpAfter: 2500,
    rpDelta: 10,
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
    rawJson: { uid: CANONICAL_UID },
    damageFromPlayer: null,
    protectAbsorb: null,
    shieldDamageOffsetFromPlayer: null,
    teamRecover: null,
    ccTimeToPlayer: null,
    viewContribution: 30,
    monsterKill: null,
    roleMetricsVersion: null,
    roleMetricsCapturedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('playerCharacterSnapshot', () => {
  it('aggregates multiple matches for same uid+character into one snapshot', () => {
    const rows = [
      baseRow({ gameId: '1001', placement: 1, victory: true }),
      baseRow({ gameId: '1002', placement: 4, victory: false, playedAt: new Date('2026-06-02T00:00:00.000Z') }),
      baseRow({ gameId: '1003', placement: 2, victory: false, playedAt: new Date('2026-06-03T00:00:00.000Z') }),
    ]
    const snapshot = aggregatePlayerCharacterSnapshot(rows, {
      canonicalUid: CANONICAL_UID,
      characterNum: 1,
      displaySeasonId: DISPLAY_SEASON,
      apiSeasonId: API_SEASON,
    })
    expect(snapshot?.eligibleMatches).toBe(3)
  })

  it('keeps different uids as separate population samples', () => {
    const a = filterRowsForShadowBenchmark({
      rows: [baseRow()],
      canonicalUid: CANONICAL_UID,
      scope: 'rank',
      displaySeasonId: DISPLAY_SEASON,
      apiSeasonId: API_SEASON,
    })
    const b = filterRowsForShadowBenchmark({
      rows: [baseRow({ uid: 'uid-other', rawJson: { uid: 'uid-other' } })],
      canonicalUid: 'uid-other',
      scope: 'rank',
      displaySeasonId: DISPLAY_SEASON,
      apiSeasonId: API_SEASON,
    })
    expect(a.rows).toHaveLength(1)
    expect(b.rows).toHaveLength(1)
    expect(a.rows[0]?.uid).not.toBe(b.rows[0]?.uid)
  })

  it('excludes cobalt and union modes', () => {
    const filtered = filterRowsForShadowBenchmark({
      rows: [
        baseRow({ gameMode: 'cobalt', matchingMode: 6 }),
        baseRow({ gameId: '1002', gameMode: 'union', matchingMode: 7 }),
        baseRow({ gameId: '1003', gameMode: 'rank' }),
      ],
      canonicalUid: CANONICAL_UID,
      scope: 'rank',
      displaySeasonId: DISPLAY_SEASON,
      apiSeasonId: API_SEASON,
    })
    expect(filtered.rows).toHaveLength(1)
    expect(filtered.stats.excludedUnsupportedMode).toBe(2)
  })

  it('excludes owner uid mismatch rows', () => {
    const filtered = filterRowsForShadowBenchmark({
      rows: [baseRow({ uid: FOREIGN_UID, rawJson: { uid: FOREIGN_UID } })],
      canonicalUid: CANONICAL_UID,
      scope: 'rank',
      displaySeasonId: DISPLAY_SEASON,
      apiSeasonId: API_SEASON,
    })
    expect(filtered.rows).toHaveLength(0)
    expect(filtered.stats.excludedOwnershipMismatch).toBe(1)
  })

  it('deduplicates duplicate gameId rows', () => {
    const filtered = filterRowsForShadowBenchmark({
      rows: [baseRow(), baseRow({ kills: 99 })],
      canonicalUid: CANONICAL_UID,
      scope: 'rank',
      displaySeasonId: DISPLAY_SEASON,
      apiSeasonId: API_SEASON,
    })
    expect(filtered.rows).toHaveLength(1)
    expect(filtered.stats.excludedDuplicateGameId).toBe(1)
  })

  it('uses null when team kill denominator is zero', () => {
    const snapshot = aggregatePlayerCharacterSnapshot(
      [baseRow({ teamKills: 0, kills: 1, assists: 1 })],
      {
        canonicalUid: CANONICAL_UID,
        characterNum: 1,
        displaySeasonId: DISPLAY_SEASON,
        apiSeasonId: API_SEASON,
      },
    )
    expect(snapshot?.teamKillParticipation).toBeNull()
  })

  it('classifies 3/10/20 match sample statuses', () => {
    expect(resolveSampleStatus(3)).toBe('exploratory')
    expect(resolveSampleStatus(10)).toBe('provisional')
    expect(resolveSampleStatus(20)).toBe('benchmarkEligible')
    expect(meetsExploratoryMinimum(EXPLORATORY_MIN_MATCHES)).toBe(true)
    expect(meetsExploratoryMinimum(EXPLORATORY_MIN_MATCHES - 1)).toBe(false)
    expect(BENCHMARK_ELIGIBLE_MIN_MATCHES).toBe(20)
  })

  it('reuses snapshots when source fingerprint is unchanged', () => {
    const fp1 = buildSourceFingerprint(['1001', '1002'])
    const fp2 = buildSourceFingerprint(['1002', '1001'])
    expect(fp1).toBe(fp2)
  })

  it('handles percentile ties with midrank', () => {
    const values = [10, 20, 20, 30]
    expect(percentileRankMidrank(values, 20)).toBeCloseTo(50, 0)
  })

  it('disables precise percentiles for small cohorts', () => {
    expect(resolvePercentileCapability(29)).toBe('disabled')
    expect(resolvePercentileCapability(40)).toBe('tercile-only')
    expect(resolvePercentileCapability(80)).toBe('decile')
    expect(resolvePercentileCapability(120)).toBe('full-percent')
    expect(resolvePercentileCapability(320)).toBe('high-confidence')
  })

  it('maps shadow grade bands from percentile', () => {
    expect(assignShadowGradeFromPercentile(99.5)).toBe('S+')
    expect(assignShadowGradeFromPercentile(50)).toBe('B+')
    expect(assignShadowGradeFromPercentile(1)).toBe('D-')
  })
})
