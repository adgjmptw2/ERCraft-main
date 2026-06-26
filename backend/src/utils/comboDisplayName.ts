import { resolveCharacterDisplayName } from './characterDisplayName.js'
import { resolveWeaponDisplayName } from './weaponDisplayName.js'

export function formatComboDisplayName(
  characterNum: number,
  weaponTypeId: number,
  characterName?: string | null,
): string {
  const character = resolveCharacterDisplayName(characterNum, characterName)
  const weapon = resolveWeaponDisplayName(weaponTypeId)
  return `${character} ${weapon}`
}

export function formatComboKey(characterNum: number, weaponTypeId: number): string {
  return `${characterNum}:${weaponTypeId}`
}
