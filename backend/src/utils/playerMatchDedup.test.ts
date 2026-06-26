import { describe, expect, it } from 'vitest'

import { deduplicatePlayerMatchRowsByGameId, type PlayerMatchRow } from './playerMatchDedup.js'

function row(
  uid: string,
  gameId: string,
  overrides: Partial<PlayerMatchRow> = {},
): PlayerMatchRow {
  return {
    uid,
    gameId,
    kills: 1,
    deaths: 0,
    assists: 0,
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  } as PlayerMatchRow
}

describe('deduplicatePlayerMatchRowsByGameId', () => {
  it('prefers canonical uid row over alias duplicate', () => {
    const canonicalUid = 'canonical-uid'
    const aliasUid = 'alias-uid'
    const result = deduplicatePlayerMatchRowsByGameId(
      [
        row(aliasUid, 'g1', { kills: 99, teamKills: 10, damageToPlayer: 5000 }),
        row(canonicalUid, 'g1', { kills: 4, teamKills: 8, damageToPlayer: 12000 }),
      ],
      canonicalUid,
    )

    expect(result.rawMatchCount).toBe(2)
    expect(result.deduplicatedMatchCount).toBe(1)
    expect(result.rows[0]?.uid).toBe(canonicalUid)
    expect(result.rows[0]?.kills).toBe(4)
  })

  it('prefers canonical uid even when alias row is more complete', () => {
    const canonicalUid = 'canonical-uid'
    const aliasUid = 'alias-uid'
    const result = deduplicatePlayerMatchRowsByGameId(
      [
        row(aliasUid, 'g1', {
          kills: 99,
          teamKills: 10,
          damageToPlayer: 5000,
          accountLevel: 100,
          bestWeapon: 1,
          equipment: '[]',
        }),
        row(canonicalUid, 'g1', { kills: 4 }),
      ],
      canonicalUid,
    )

    expect(result.rows[0]?.uid).toBe(canonicalUid)
    expect(result.rows[0]?.kills).toBe(4)
  })

  it('keeps distinct gameIds from canonical and alias', () => {
    const canonicalUid = 'canonical-uid'
    const aliasUid = 'alias-uid'
    const result = deduplicatePlayerMatchRowsByGameId(
      [row(canonicalUid, 'g1'), row(aliasUid, 'g2')],
      canonicalUid,
    )

    expect(result.rawMatchCount).toBe(2)
    expect(result.deduplicatedMatchCount).toBe(2)
  })

  it('deduplicates 10 duplicate pairs to 10 matches', () => {
    const canonicalUid = 'canonical-uid'
    const aliasUid = 'alias-uid'
    const rows: PlayerMatchRow[] = []
    for (let i = 0; i < 10; i += 1) {
      rows.push(row(aliasUid, `g${i}`))
      rows.push(row(canonicalUid, `g${i}`))
    }

    const result = deduplicatePlayerMatchRowsByGameId(rows, canonicalUid)
    expect(result.rawMatchCount).toBe(20)
    expect(result.deduplicatedMatchCount).toBe(10)
  })
})
