import { describe, expect, it } from 'vitest'

import { buildRoleSummary, getCharacterRoleProfile } from '@/analysis/roleClassifier'
import type { MatchSummary } from '@/types/match'

function demoMatch(characterName: string, id: string): MatchSummary {
  return {
    matchId: id,
    userNum: 920517,
    characterName,
    placement: 5,
    kills: 3,
    deaths: 3,
    assists: 3,
    gameStartedAt: '2026-04-01T12:00:00.000Z',
    victory: false,
  }
}

describe('roleClassifier', () => {
  it('getCharacterRoleProfile — Yuki', () => {
    expect(getCharacterRoleProfile('Yuki')).toEqual({
      primaryRole: '딜러',
      secondaryRole: '브루저',
    })
  })

  it('getCharacterRoleProfile — Jackie 브루저', () => {
    expect(getCharacterRoleProfile('Jackie')).toEqual({
      primaryRole: '브루저',
      secondaryRole: null,
    })
  })

  it('getCharacterRoleProfile — unknown returns null', () => {
    expect(getCharacterRoleProfile('UnknownHero')).toBeNull()
  })

  it('buildRoleSummary — 마인 데모 매치 기준 주 역할군 딜러', () => {
    const matches = [
      ...Array.from({ length: 4 }, (_, i) => demoMatch('Yuki', `y-${i}`)),
      ...Array.from({ length: 4 }, (_, i) => demoMatch('Adela', `a-${i}`)),
      ...Array.from({ length: 4 }, (_, i) => demoMatch('Hyejin', `h-${i}`)),
    ]

    const summary = buildRoleSummary(matches)
    expect(summary.status).toBe('ready')
    expect(summary.primaryRole).toBe('딜러')
    expect(summary.secondaryRole).not.toBeNull()
    expect(summary.sampleSize).toBe(12)
  })

  it('buildRoleSummary — 표본 부족', () => {
    const summary = buildRoleSummary([demoMatch('Yuki', 'one'), demoMatch('Adela', 'two')])
    expect(summary.status).toBe('insufficient')
    expect(summary.primaryRole).toBe('판단 보류')
  })

  it('buildRoleSummary — unknown character does not throw', () => {
    const matches = Array.from({ length: 4 }, (_, i) => demoMatch('UnknownHero', `u-${i}`))
    const summary = buildRoleSummary(matches)
    expect(summary.status).toBe('insufficient')
  })
})
