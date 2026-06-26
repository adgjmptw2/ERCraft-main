import { resolveVerifiedWeaponTypeSlug } from '@/assets/itemAssetMap'
import { GameAssetIcon, type GameAssetIconProps } from '@/components/shared/GameAssetIcon'
import { itemIconUrlFromSlug } from '@/utils/assetUrls'

export interface WeaponTypeIconProps extends Omit<GameAssetIconProps, 'src'> {
  slug?: string | null
  src?: string | null
}

export function WeaponTypeIcon({ slug, src, label, ...rest }: WeaponTypeIconProps) {
  const verifiedSlug = resolveVerifiedWeaponTypeSlug(slug)
  const resolvedSrc = src ?? (verifiedSlug ? itemIconUrlFromSlug(verifiedSlug) : null)

  return (
    <GameAssetIcon src={resolvedSrc} label={label ?? verifiedSlug ?? undefined} {...rest} />
  )
}
