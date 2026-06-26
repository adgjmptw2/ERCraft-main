import generated from '@/assets/erCodeMaps.generated.json'
import {
  resolveItemSlugFromCode,
  resolveVerifiedGearItemSlug,
  resolveVerifiedWeaponTypeSlug,
} from '@/assets/itemAssetMap'
import {
  resolveTacticalSkillSlugFromGroupCode,
  resolveVerifiedTacticalSkillSlug,
  resolveVerifiedTraitSlug,
} from '@/assets/loadoutAssetMap'
import type {
  MatchEquipmentGearGrades,
  MatchEquipmentGearPreview,
  MatchEquipmentPreview,
} from '@/types/match'
import {
  equipmentGradeFromNumber,
  type EquipmentItemGrade,
} from '@/utils/equipmentItemGrade'

/** BSER 게임 결과 장비/특성 필드 */
export interface EquipmentSourceGame {
  bestWeapon?: number
  tacticalSkillGroup?: number
  traitFirstCore?: number
  traitFirstSub?: number[]
  traitSecondSub?: number[]
  equipment?: number[] | Record<string, number>
  equipmentGrade?: number[] | Record<string, number>
}

interface ErCodeMaps {
  itemCodeToSlug: Record<string, string>
  itemCodeToGrade: Record<string, EquipmentItemGrade>
  traitCodeToSlug: Record<string, string>
  traitCodeToGroup: Record<string, string>
  traitGroupToSlug: Record<string, string>
  weaponTypeIdToSlug: Record<string, string>
  tacticalSkillGroupToSlug: Record<string, string>
}

const maps = generated as ErCodeMaps

const SUB_TRAIT_GROUP_SLUG_OVERRIDES: Readonly<Record<string, string>> = {
  Havoc: 'havoc/havoc2',
}

/** BSER API는 equipment를 배열 대신 {"0":code,...} 객체로 반환한다 */
export function normalizeIndexedNumberList(
  value: number[] | Record<string, number> | null | undefined,
): number[] | undefined {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) return value

  const keys = Object.keys(value)
    .map((k) => Number(k))
    .filter((k) => Number.isInteger(k) && k >= 0)
  if (keys.length === 0) return undefined

  const max = Math.max(...keys)
  const out: number[] = []
  for (let i = 0; i <= max; i++) {
    const code = value[String(i)]
    if (code !== undefined) out[i] = code
  }
  return out
}

function mapCode(
  table: Record<string, string>,
  code: number | null | undefined,
): string | null {
  if (code === null || code === undefined) return null
  return table[String(code)] ?? null
}

function mapGearSlot(
  equipment: number[] | undefined,
  slotIndex: number,
): string | undefined {
  const code = equipment?.[slotIndex]
  if (code === undefined) return undefined
  const slug = resolveItemSlugFromCode(code)
  return resolveVerifiedGearItemSlug(slug) ?? undefined
}

function mapGearGradeSlot(
  equipment: number[] | undefined,
  equipmentGrade: number[] | undefined,
  slotIndex: number,
): EquipmentItemGrade | undefined {
  const code = equipment?.[slotIndex]
  if (code === undefined) return undefined
  const fromItem = maps.itemCodeToGrade?.[String(code)]
  if (fromItem) return fromItem
  return equipmentGradeFromNumber(equipmentGrade?.[slotIndex])
}

/** 슬롯4 — 보조 특성 트리 그룹 아이콘 (예: 파괴/저항/지원) */
function mapSubTraitGroupSlug(game: EquipmentSourceGame): string | undefined {
  const code = game.traitSecondSub?.[0]
  if (code === undefined) return undefined
  const group = maps.traitCodeToGroup?.[String(code)]
  if (!group) return undefined
  const slug = SUB_TRAIT_GROUP_SLUG_OVERRIDES[group] ?? maps.traitGroupToSlug?.[group]
  return resolveVerifiedTraitSlug(slug) ?? undefined
}

/**
 * BSER 원본 코드 → MatchEquipmentPreview (manifest 검증 slug만)
 * - 슬롯3: traitFirstCore
 * - 슬롯4: traitSecondSub 트리 그룹 (개별 보조 특성 아님)
 * - 장비: equipment[0..4] = 무기·상의·머리·팔·다리
 */
export function mapGameToEquipmentPreview(
  game: EquipmentSourceGame,
): MatchEquipmentPreview | undefined {
  const equipment = normalizeIndexedNumberList(game.equipment)
  const equipmentGrade = normalizeIndexedNumberList(game.equipmentGrade)
  const weaponTypeSlug =
    resolveVerifiedWeaponTypeSlug(mapCode(maps.weaponTypeIdToSlug, game.bestWeapon)) ??
    undefined
  const tacticalSkillSlug =
    resolveVerifiedTacticalSkillSlug(
      resolveTacticalSkillSlugFromGroupCode(game.tacticalSkillGroup),
    ) ?? undefined
  const mainTraitSlug =
    resolveVerifiedTraitSlug(mapCode(maps.traitCodeToSlug, game.traitFirstCore)) ?? undefined
  const subTraitSlug = mapSubTraitGroupSlug(game)

  const gear: MatchEquipmentGearPreview = {
    weapon: mapGearSlot(equipment, 0),
    chest: mapGearSlot(equipment, 1),
    head: mapGearSlot(equipment, 2),
    arm: mapGearSlot(equipment, 3),
    leg: mapGearSlot(equipment, 4),
  }

  const gearGrade: MatchEquipmentGearGrades = {
    weapon: mapGearGradeSlot(equipment, equipmentGrade, 0),
    chest: mapGearGradeSlot(equipment, equipmentGrade, 1),
    head: mapGearGradeSlot(equipment, equipmentGrade, 2),
    arm: mapGearGradeSlot(equipment, equipmentGrade, 3),
    leg: mapGearGradeSlot(equipment, equipmentGrade, 4),
  }

  const hasGear = Object.values(gear).some(Boolean)
  const hasGrade = Object.values(gearGrade).some(Boolean)
  if (
    !weaponTypeSlug &&
    !tacticalSkillSlug &&
    !mainTraitSlug &&
    !subTraitSlug &&
    !hasGear
  ) {
    return undefined
  }

  return {
    weaponTypeSlug,
    tacticalSkillSlug,
    mainTraitSlug,
    subTraitSlug,
    gear: hasGear ? gear : undefined,
    gearGrade: hasGrade ? gearGrade : undefined,
  }
}
