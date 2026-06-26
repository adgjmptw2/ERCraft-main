import weaponTypeData from '../data/weaponTypeIdToKo.generated.json' with { type: 'json' }

const WEAPON_TYPE_ID_TO_KO: ReadonlyMap<number, string> = new Map(
  Object.entries(weaponTypeData.weaponTypeIdToKo).flatMap(([code, name]) => {
    const num = Number(code)
    const ko = name.trim()
    if (!Number.isInteger(num) || num <= 0 || !ko) return []
    return [[num, ko] as const]
  }),
)

export function resolveWeaponDisplayName(weaponTypeId: number | null | undefined): string {
  if (typeof weaponTypeId !== 'number' || !Number.isInteger(weaponTypeId) || weaponTypeId <= 0) {
    return '무기 ?'
  }
  return WEAPON_TYPE_ID_TO_KO.get(weaponTypeId) ?? `무기 ${weaponTypeId}`
}
