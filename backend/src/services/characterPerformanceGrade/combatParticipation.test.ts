import { describe, expect, it } from 'vitest'

import {
  computeFinisherShare,
  computeParticipationAssistWeighted,
  computeParticipationCapped,
  computeParticipationRaw,
  computeParticipationWithZeroTeamKill,
} from './combatParticipation.js'

describe('combatParticipation', () => {
  const input = { playerKill: 3, playerAssistant: 2, teamKill: 10 }

  it('participationRaw', () => {
    expect(computeParticipationRaw(input)).toBe(0.5)
  })

  it('participationCapped', () => {
    expect(
      computeParticipationCapped({ playerKill: 8, playerAssistant: 5, teamKill: 10 }),
    ).toBe(1)
  })

  it('assist weights 0.5/0.7/1.0', () => {
    expect(computeParticipationAssistWeighted(input, 0.5)).toBe(0.4)
    expect(computeParticipationAssistWeighted(input, 0.7)).toBeCloseTo(0.44)
    expect(computeParticipationAssistWeighted(input, 1)).toBe(0.5)
  })

  it('teamKill 0 null vs zero modes', () => {
    const zeroInput = { playerKill: 1, playerAssistant: 1, teamKill: 0 }
    expect(computeParticipationRaw(zeroInput)).toBeNull()
    expect(computeParticipationWithZeroTeamKill(zeroInput, 'null')).toBeNull()
    expect(computeParticipationWithZeroTeamKill(zeroInput, 'zero')).toBe(0)
  })

  it('finisherShare', () => {
    expect(computeFinisherShare(input)).toBe(0.3)
  })

  it('K+A over teamKill preserved in raw', () => {
    expect(computeParticipationRaw({ playerKill: 8, playerAssistant: 5, teamKill: 10 })).toBe(1.3)
  })

  it('null when fields missing', () => {
    expect(computeParticipationRaw({ playerKill: null, playerAssistant: 2, teamKill: 3 })).toBeNull()
  })
})
