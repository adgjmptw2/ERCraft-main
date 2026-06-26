import { describe, expect, it } from 'vitest'

import {
  buildComboKey,
  comboPriorityWeight,
  scoreBalancedGame,
  selectBalancedGamePlans,
} from './roleMetricBalancedBackfill.js'

describe('roleMetricBalancedBackfill', () => {
  it('ready 조합은 후순위', () => {
    expect(comboPriorityWeight(489, null)).toBe(1)
    expect(comboPriorityWeight(10, '탱커')).toBe(1500)
  })

  it('balanced game scoring', () => {
    const score = scoreBalancedGame(
      {
        gameId: 'g1',
        rowCount: 2,
        comboKeys: ['gold|73:24', 'mithril_plus|19:6'],
      },
      new Map([
        ['gold|73:24', 5],
        ['mithril_plus|19:6', 489],
      ]),
      new Map([
        ['gold|73:24', '서포터'],
        ['mithril_plus|19:6', '스증 딜러'],
      ]),
    )
    expect(score).toBeGreaterThan(1000)
  })

  it('balanced selection caps at maxGames', () => {
    const selected = selectBalancedGamePlans(
      [
        { gameId: 'a', rowCount: 1, comboKeys: ['gold|30:13'] },
        { gameId: 'b', rowCount: 1, comboKeys: ['gold|73:24'] },
        { gameId: 'c', rowCount: 1, comboKeys: ['gold|76:3'] },
      ],
      new Map([
        ['gold|30:13', 5],
        ['gold|73:24', 8],
        ['gold|76:3', 12],
      ]),
      new Map([
        ['gold|30:13', '탱커'],
        ['gold|73:24', '서포터'],
        ['gold|76:3', '탱커'],
      ]),
      2,
    )
    expect(selected).toHaveLength(2)
  })

  it('buildComboKey format', () => {
    expect(buildComboKey('gold', 73, 24)).toBe('gold|73:24')
  })
})
