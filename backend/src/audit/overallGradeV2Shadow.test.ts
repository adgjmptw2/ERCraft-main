import { describe, expect, it } from 'vitest'

import {
  buildOverallGradeV2ShadowArtifact,
  benchmarkKey,
  type OverallV2IdentityMap,
  type OverallV2MatchInput,
} from './overallGradeV2Shadow.js'

function identities(): OverallV2IdentityMap {
  const canonicalUidBySourceUid = new Map<string, string>()
  const canonicalUserNumByCanonicalUid = new Map<string, string>()
  for (let index = 1; index <= 14; index += 1) {
    const canonicalUid = `canonical-${index}`
    canonicalUidBySourceUid.set(canonicalUid, canonicalUid)
    canonicalUserNumByCanonicalUid.set(canonicalUid, `${1000 + index}`)
  }
  canonicalUidBySourceUid.set('old-1', 'canonical-1')
  canonicalUidBySourceUid.set('new-1', 'canonical-1')
  return { canonicalUidBySourceUid, canonicalUserNumByCanonicalUid }
}

function match(params: {
  uid: string
  gameId: string
  index: number
  mode?: string
  characterNum?: number
  bestWeapon?: number
  rpAfter?: number
  score?: number
}): OverallV2MatchInput {
  return {
    uid: params.uid,
    gameId: params.gameId,
    apiSeasonId: 39,
    displaySeasonId: 11,
    gameMode: params.mode ?? 'rank',
    playedAt: new Date(Date.UTC(2026, 5, 1, 0, params.index)).toISOString(),
    characterNum: params.characterNum ?? 1,
    bestWeapon: params.bestWeapon ?? 14,
    rpAfter: params.rpAfter ?? 4500,
    placement: (params.index % 8) + 1,
    victory: params.index % 8 === 0,
    kills: params.index % 6,
    assists: params.index % 7,
    deaths: params.index % 3,
    teamKills: params.index % 10,
    damageToPlayer: 9000 + params.index * 100,
    viewContribution: 5 + (params.index % 5),
    monsterKill: 12 + (params.index % 4),
    gameDuration: 1000 + params.index,
    matchGradeScore: params.score ?? 50 + (params.index % 40),
  }
}

function fixtureMatches(): OverallV2MatchInput[] {
  const rows: OverallV2MatchInput[] = []
  for (let player = 1; player <= 13; player += 1) {
    const uid = player === 1 ? 'old-1' : `canonical-${player}`
    rows.push(match({ uid, gameId: `${player}-a`, index: player * 2, score: 45 + player }))
    rows.push(match({ uid, gameId: `${player}-b`, index: player * 2 + 1, score: 55 + player }))
  }
  rows.push(match({ uid: 'new-1', gameId: '1-c', index: 99, score: 80 }))
  rows.push(match({ uid: 'canonical-1', gameId: 'cobalt-1', index: 100, mode: 'cobalt', score: 99 }))
  rows.push(match({ uid: 'canonical-2', gameId: 'normal-1', index: 101, mode: 'normal', score: 99 }))
  return rows
}

describe('overallGradeV2Shadow', () => {
  it('builds exactly one row per canonical player-season-mode and excludes non-rank modes', () => {
    const artifact = buildOverallGradeV2ShadowArtifact(fixtureMatches(), identities(), {
      generatedAt: '2026-06-21T00:00:00.000Z',
      minCohortSize: 12,
    })

    expect(artifact.rows).toHaveLength(13)
    expect(new Set(artifact.rows.map((row) => `${row.canonicalUserNum}:${row.seasonId}:${row.matchMode}`)).size).toBe(13)
    expect(artifact.rows.every((row) => row.matchMode === 'rank')).toBe(true)
    expect(artifact.rows.find((row) => row.canonicalUserNum === '1001')?.matchCount).toBe(3)
  })

  it('resolves deterministic primary role and cohort keys', () => {
    const artifact = buildOverallGradeV2ShadowArtifact(fixtureMatches(), identities(), {
      generatedAt: '2026-06-21T00:00:00.000Z',
      minCohortSize: 12,
    })
    const first = artifact.rows[0]

    expect(first?.primaryRole).toBe('평타 브루저')
    expect(first?.primaryRoleMatchShare).toBe(1)
    expect(first?.benchmarkKey).toBe(
      benchmarkKey({
        seasonId: 11,
        matchMode: 'rank',
        tierBand: first?.tierBand ?? 'unknown',
        primaryRole: '평타 브루저',
      }),
    )
  })

  it('computes outcome, role, consistency, and 30/50/20 total without confidence blending', () => {
    const artifact = buildOverallGradeV2ShadowArtifact(fixtureMatches(), identities(), {
      generatedAt: '2026-06-21T00:00:00.000Z',
      minCohortSize: 12,
      percentileMinCohortSize: 20,
    })
    const row = artifact.rows.find((entry) => entry.canonicalUserNum === '1001')

    expect(row?.outcomePerformanceScore).toBeTypeOf('number')
    expect(row?.rolePerformanceScore).toBeTypeOf('number')
    expect(row?.consistencyScore).toBeTypeOf('number')
    const expected =
      (row?.outcomePerformanceScore ?? 0) * 0.3 +
      (row?.rolePerformanceScore ?? 0) * 0.5 +
      (row?.consistencyScore ?? 0) * 0.2
    expect(row?.overallV2Score).toBe(Math.round(expected * 100) / 100)
    expect(row?.confidence).not.toBe(row?.overallV2Score)
  })

  it('does not fabricate percentile when cohort is below percentile threshold', () => {
    const artifact = buildOverallGradeV2ShadowArtifact(fixtureMatches(), identities(), {
      generatedAt: '2026-06-21T00:00:00.000Z',
      minCohortSize: 12,
      percentileMinCohortSize: 20,
    })
    const row = artifact.rows[0]

    expect(row?.outcomeEmpiricalPercentile).toBeNull()
    expect(row?.roleEmpiricalPercentile).toBeNull()
    expect(row?.consistencyEmpiricalPercentile).toBeNull()
  })

  it('excludes the evaluated player from leave-one-player-out cohorts', () => {
    const artifact = buildOverallGradeV2ShadowArtifact(fixtureMatches(), identities(), {
      generatedAt: '2026-06-21T00:00:00.000Z',
      minCohortSize: 12,
      leaveOneCanonicalUserNum: '1001',
    })
    const row = artifact.rows.find((entry) => entry.canonicalUserNum === '1001')

    expect(row?.cohortPlayerSeasonCount).toBe(12)
    expect(row?.fallbackLevel).toBe('exact')
  })

  it('is deterministic for the same input and generatedAt', () => {
    const first = buildOverallGradeV2ShadowArtifact(fixtureMatches(), identities(), {
      generatedAt: '2026-06-21T00:00:00.000Z',
      minCohortSize: 12,
    })
    const second = buildOverallGradeV2ShadowArtifact(fixtureMatches(), identities(), {
      generatedAt: '2026-06-21T00:00:00.000Z',
      minCohortSize: 12,
    })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
