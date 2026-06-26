import type { CharacterGradeRole } from './config.js'
import { ROLE_PRESET_WEIGHTS } from './config.js'
import { resolveSupportSubtype } from './supportSubtype.js'

export type CombatShadowPresetId = 'C0' | 'C1' | 'C2' | 'C3'

export type CombatShadowPreset = Record<string, number>

export type GradeCombatMetricMode =
  | 'legacy-k-a-tk'
  | 'dealer-combat-c3'
  | 'assassin-combat-c3'
  | 'bruiser-combat-c3'
  | 'tank-combat-fallback'
  | 'support-healer-combat'
  | 'support-utility-combat'
  | 'role-score-v2'
  | 'role-score-v3'

export type GradeCombatMetricFallbackReason =
  | 'baseline-unavailable'
  | 'readiness-insufficient'
  | 'coverage-insufficient'
  | 'sample-insufficient'
  | 'season-mismatch'
  | 'invalid-anchor'
  | 'metric-missing'
  | 'exact-key-blocked'
  | 'preset-incomplete'
  | 'source-disabled'
  | null

export const COMBAT_LIVE_PRESET_DEALER_AUTO: CombatShadowPreset = {
  damageToPlayer: 41,
  combatContribution: 18,
  finisherShare: 3,
  survival: 15,
  viewContribution: 8,
  monsterKill: 15,
}

export const COMBAT_LIVE_PRESET_DEALER_SKILL: CombatShadowPreset = {
  damageToPlayer: 43,
  combatContribution: 18,
  finisherShare: 3,
  survival: 15,
  viewContribution: 10,
  monsterKill: 11,
}

export const COMBAT_LIVE_PRESET_ASSASSIN: CombatShadowPreset = {
  damageToPlayer: 31,
  combatContribution: 18,
  finisherShare: 8,
  survival: 20,
  viewContribution: 10,
  monsterKill: 13,
}

export const COMBAT_LIVE_PRESET_BRUISER_AUTO: CombatShadowPreset = {
  damageToPlayer: 29,
  combatContribution: 20,
  survival: 25,
  viewContribution: 10,
  monsterKill: 16,
}

export const COMBAT_LIVE_PRESET_BRUISER_SKILL: CombatShadowPreset = {
  damageToPlayer: 31,
  combatContribution: 20,
  survival: 25,
  viewContribution: 12,
  monsterKill: 12,
}

export const COMBAT_LIVE_PRESET_TANK_FALLBACK: CombatShadowPreset = {
  damageToPlayer: 7,
  combatContribution: 20,
  survival: 38,
  viewContribution: 25,
  monsterKill: 10,
}

export const COMBAT_LIVE_PRESET_HEALER_COMBAT: CombatShadowPreset = {
  damageToPlayer: 5,
  combatContribution: 20,
  survival: 30,
  viewContribution: 35,
  monsterKill: 10,
}

export const COMBAT_LIVE_PRESET_UTILITY_COMBAT: CombatShadowPreset = {
  damageToPlayer: 10,
  combatContribution: 25,
  survival: 25,
  viewContribution: 25,
  monsterKill: 15,
}

export const COMBAT_SHADOW_PRESET_C2: Partial<Record<CharacterGradeRole, CombatShadowPreset>> = {
  '평타 딜러': {
    damageToPlayer: 38,
    combatParticipation: 18,
    finisherShare: 6,
    survival: 15,
    viewContribution: 8,
    monsterKill: 15,
  },
  '스증 딜러': {
    damageToPlayer: 40,
    combatParticipation: 18,
    finisherShare: 6,
    survival: 15,
    viewContribution: 10,
    monsterKill: 11,
  },
  암살자: {
    damageToPlayer: 27,
    combatParticipation: 18,
    finisherShare: 12,
    survival: 20,
    viewContribution: 10,
    monsterKill: 13,
  },
  '평타 브루저': {
    damageToPlayer: 25,
    combatParticipation: 20,
    finisherShare: 4,
    survival: 25,
    viewContribution: 10,
    monsterKill: 16,
  },
  '스증 브루저': {
    damageToPlayer: 27,
    combatParticipation: 20,
    finisherShare: 4,
    survival: 25,
    viewContribution: 12,
    monsterKill: 12,
  },
  탱커: {
    damageToPlayer: 7,
    combatParticipation: 20,
    survival: 28,
    viewContribution: 17,
    monsterKill: 8,
    tankingUtility: 20,
  },
  서포터: {
    damageToPlayer: 10,
    combatParticipation: 25,
    survival: 25,
    viewContribution: 25,
    monsterKill: 15,
  },
}

export const COMBAT_SHADOW_PRESET_C3_FINISHER: Partial<Record<CharacterGradeRole, number>> = {
  '평타 딜러': 3,
  '스증 딜러': 3,
  암살자: 8,
  '평타 브루저': 0,
  '스증 브루저': 0,
  탱커: 0,
  서포터: 0,
}

export const COMBAT_HEALER_SHADOW_PRESET_C2: CombatShadowPreset = {
  damageToPlayer: 5,
  combatParticipation: 18,
  survival: 17,
  viewContribution: 20,
  monsterKill: 5,
  supportUtility: 35,
}

function sumPresetWeights(preset: Record<string, number>): number {
  return Object.values(preset).reduce((sum, weight) => sum + weight, 0)
}

export function resolveCombatLivePreset(
  role: CharacterGradeRole,
  characterNum: number,
  weaponTypeId: number,
): { preset: CombatShadowPreset; mode: GradeCombatMetricMode } | null {
  switch (role) {
    case '평타 딜러':
      return { preset: { ...COMBAT_LIVE_PRESET_DEALER_AUTO }, mode: 'dealer-combat-c3' }
    case '스증 딜러':
      return { preset: { ...COMBAT_LIVE_PRESET_DEALER_SKILL }, mode: 'dealer-combat-c3' }
    case '암살자':
      return { preset: { ...COMBAT_LIVE_PRESET_ASSASSIN }, mode: 'assassin-combat-c3' }
    case '평타 브루저':
      return { preset: { ...COMBAT_LIVE_PRESET_BRUISER_AUTO }, mode: 'bruiser-combat-c3' }
    case '스증 브루저':
      return { preset: { ...COMBAT_LIVE_PRESET_BRUISER_SKILL }, mode: 'bruiser-combat-c3' }
    case '탱커':
      return { preset: { ...COMBAT_LIVE_PRESET_TANK_FALLBACK }, mode: 'tank-combat-fallback' }
    case '서포터': {
      const subtype = resolveSupportSubtype(characterNum, weaponTypeId, role)
      if (subtype === 'healer') {
        return { preset: { ...COMBAT_LIVE_PRESET_HEALER_COMBAT }, mode: 'support-healer-combat' }
      }
      return { preset: { ...COMBAT_LIVE_PRESET_UTILITY_COMBAT }, mode: 'support-utility-combat' }
    }
    default:
      return null
  }
}

export function buildCombatShadowPresetC0(role: CharacterGradeRole): CombatShadowPreset {
  return { ...ROLE_PRESET_WEIGHTS[role] }
}

export function buildCombatShadowPresetC1(role: CharacterGradeRole): CombatShadowPreset {
  const legacy = ROLE_PRESET_WEIGHTS[role]
  const combatTotal = legacy.playerKill + legacy.playerAssistant + legacy.teamKill
  const next: CombatShadowPreset = {
    damageToPlayer: legacy.damageToPlayer,
    combatParticipation: combatTotal,
    survival: legacy.survival,
    viewContribution: legacy.viewContribution,
    monsterKill: legacy.monsterKill,
  }
  return next
}

export function buildCombatShadowPresetC2(
  role: CharacterGradeRole,
  characterNum: number,
  weaponTypeId: number,
): { preset: CombatShadowPreset | null; unsupportedReason: string | null } {
  const subtype = resolveSupportSubtype(characterNum, weaponTypeId, role)
  if (role === '서포터' && subtype === 'healer') {
    const preset = { ...COMBAT_HEALER_SHADOW_PRESET_C2 }
    return sumPresetWeights(preset) === 100
      ? { preset, unsupportedReason: null }
      : { preset: null, unsupportedReason: 'healer-preset-invalid' }
  }
  if (role === '서포터' && subtype === 'utility') {
    const preset = COMBAT_SHADOW_PRESET_C2['서포터']
    return preset && sumPresetWeights(preset) === 100
      ? { preset: { ...preset }, unsupportedReason: null }
      : { preset: null, unsupportedReason: 'utility-preset-invalid' }
  }
  const preset = COMBAT_SHADOW_PRESET_C2[role]
  if (!preset || sumPresetWeights(preset) !== 100) {
    return { preset: null, unsupportedReason: 'missing-preset' }
  }
  return { preset: { ...preset }, unsupportedReason: null }
}

export function buildCombatShadowPresetC3(
  role: CharacterGradeRole,
  characterNum: number,
  weaponTypeId: number,
): { preset: CombatShadowPreset | null; unsupportedReason: string | null } {
  const base = buildCombatShadowPresetC2(role, characterNum, weaponTypeId)
  if (!base.preset) return base
  const finisherTarget = COMBAT_SHADOW_PRESET_C3_FINISHER[role]
  if (finisherTarget == null) return base
  const preset = { ...base.preset }
  const currentFinisher = preset.finisherShare ?? 0
  const delta = currentFinisher - finisherTarget
  preset.damageToPlayer = (preset.damageToPlayer ?? 0) + delta
  if (finisherTarget <= 0) {
    delete preset.finisherShare
  } else {
    preset.finisherShare = finisherTarget
  }
  return sumPresetWeights(preset) === 100
    ? { preset, unsupportedReason: null }
    : { preset: null, unsupportedReason: 'c3-weight-mismatch' }
}

export function sumCombatShadowPresetWeights(preset: Record<string, number>): number {
  return sumPresetWeights(preset)
}

export function sumCombatLivePresetWeights(preset: Record<string, number>): number {
  return sumPresetWeights(preset)
}

export function usesFinisherShareInLivePreset(preset: CombatShadowPreset): boolean {
  return (preset.finisherShare ?? 0) > 0
}
