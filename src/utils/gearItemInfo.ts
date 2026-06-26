import { resolveVerifiedGearItemSlug } from '@/assets/itemAssetMap'
import {
  equipmentGradeLabel,
  type EquipmentItemGrade,
} from '@/utils/equipmentItemGrade'
import { itemDisplayNameFromSlug } from '@/utils/itemDisplayName'

export interface GearItemInfo {
  slotLabel: string
  itemName: string
  gradeLabel?: string
}

export function buildGearItemInfo(
  slug: string | null | undefined,
  slotLabel: string,
  grade?: EquipmentItemGrade,
): GearItemInfo | null {
  const verified = resolveVerifiedGearItemSlug(slug)
  const itemName = itemDisplayNameFromSlug(verified ?? slug)
  if (!itemName) return null

  return {
    slotLabel,
    itemName,
    gradeLabel: equipmentGradeLabel(grade),
  }
}
