import { resolveVerifiedGearItemSlug, resolveVerifiedItemSlug } from '@/assets/itemAssetMap'
import { GameAssetIcon, type GameAssetIconProps } from '@/components/shared/GameAssetIcon'
import { itemIconUrlByCode, itemIconUrlFromSlug } from '@/utils/assetUrls'
import type { EquipmentItemGrade } from '@/utils/equipmentItemGrade'

export interface ItemIconProps extends Omit<GameAssetIconProps, 'src'> {
  slug?: string | null
  itemCode?: number | string | null
  src?: string | null
  grade?: EquipmentItemGrade
}

export function ItemIcon({ slug, itemCode, src, label, grade, ...rest }: ItemIconProps) {
  const verifiedSlug = resolveVerifiedGearItemSlug(slug) ?? resolveVerifiedItemSlug(slug)
  const resolvedSrc =
    src ?? (verifiedSlug ? itemIconUrlFromSlug(verifiedSlug) : null) ?? itemIconUrlByCode(itemCode)

  return (
    <GameAssetIcon
      src={resolvedSrc}
      label={label ?? verifiedSlug ?? undefined}
      grade={grade}
      {...rest}
    />
  )
}
