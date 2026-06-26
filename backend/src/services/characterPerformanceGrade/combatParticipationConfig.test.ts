import { describe, expect, it } from 'vitest'

import {
  buildCombatShadowPresetC0,
  buildCombatShadowPresetC1,
  buildCombatShadowPresetC2,
  buildCombatShadowPresetC3,
  COMBAT_LIVE_PRESET_UTILITY_COMBAT,
  resolveCombatLivePreset,
  sumCombatLivePresetWeights,
  sumCombatShadowPresetWeights,
} from './combatParticipationConfig.js'

describe('combatParticipationConfig', () => {
  it('live C3 preset sums to 100', () => {
    const presets = [
      resolveCombatLivePreset('평타 딜러', 2, 10)?.preset,
      resolveCombatLivePreset('스증 딜러', 2, 11)?.preset,
      resolveCombatLivePreset('암살자', 18, 15)?.preset,
      resolveCombatLivePreset('평타 브루저', 10, 1)?.preset,
      resolveCombatLivePreset('스증 브루저', 10, 20)?.preset,
      resolveCombatLivePreset('탱커', 85, 13)?.preset,
      resolveCombatLivePreset('서포터', 69, 9)?.preset,
      resolveCombatLivePreset('서포터', 73, 24)?.preset,
    ]
    for (const preset of presets) {
      expect(preset).toBeTruthy()
      expect(sumCombatLivePresetWeights(preset!)).toBe(100)
    }
  })

  it('C0/C1/C2/C3 preset sums to 100', () => {
    const roles = [
      '평타 딜러',
      '스증 딜러',
      '암살자',
      '평타 브루저',
      '스증 브루저',
      '탱커',
      '서포터',
    ] as const
    for (const role of roles) {
      expect(sumCombatShadowPresetWeights(buildCombatShadowPresetC0(role))).toBe(100)
      expect(sumCombatShadowPresetWeights(buildCombatShadowPresetC1(role))).toBe(100)
      const c2 = buildCombatShadowPresetC2(role, role === '서포터' ? 69 : 1, role === '서포터' ? 9 : 1)
      if (c2.preset) expect(sumCombatShadowPresetWeights(c2.preset)).toBe(100)
      const c3 = buildCombatShadowPresetC3(role, role === '서포터' ? 69 : 1, role === '서포터' ? 9 : 1)
      if (c3.preset) expect(sumCombatShadowPresetWeights(c3.preset)).toBe(100)
    }
  })

  it('tank and support finisher unused in C2 utility/healer', () => {
    const utility = buildCombatShadowPresetC2('서포터', 69, 9).preset
    expect(utility?.finisherShare).toBeUndefined()
    expect(utility?.teamRecover).toBeUndefined()
    const tank = buildCombatShadowPresetC2('탱커', 85, 13).preset
    expect(tank?.finisherShare).toBeUndefined()
  })

  it('healer support uses teamRecover utility slot', () => {
    const healer = buildCombatShadowPresetC2('서포터', 73, 24).preset
    expect(healer?.supportUtility).toBe(35)
    expect(sumCombatShadowPresetWeights(healer!)).toBe(100)
  })
})
