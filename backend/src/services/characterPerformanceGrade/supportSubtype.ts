import type { CharacterGradeRole } from './config.js'

export type SupportSubtype = 'healer' | 'utility'

export const HEALER_SUPPORT_COMBO_KEYS = new Set(['41:24', '73:24'])

export function buildSupportComboKey(characterNum: number, weaponTypeId: number): string {
  return `${characterNum}:${weaponTypeId}`
}

export function isHealerSupportCombo(characterNum: number, weaponTypeId: number): boolean {
  return HEALER_SUPPORT_COMBO_KEYS.has(buildSupportComboKey(characterNum, weaponTypeId))
}

export function resolveSupportSubtype(
  characterNum: number,
  weaponTypeId: number,
  role: CharacterGradeRole,
): SupportSubtype | null {
  if (role !== '서포터') return null
  return isHealerSupportCombo(characterNum, weaponTypeId) ? 'healer' : 'utility'
}
