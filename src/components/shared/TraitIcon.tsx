import { resolveVerifiedTraitSlug } from '@/assets/loadoutAssetMap'
import { GameAssetIcon, type GameAssetIconProps } from '@/components/shared/GameAssetIcon'
import { traitIconUrlFromSlug } from '@/utils/assetUrls'

export interface TraitIconProps extends Omit<GameAssetIconProps, 'src'> {
  slug?: string | null
  src?: string | null
}

export function TraitIcon({ slug, src, label, ...rest }: TraitIconProps) {
  const verifiedSlug = resolveVerifiedTraitSlug(slug)
  const resolvedSrc = src ?? (verifiedSlug ? traitIconUrlFromSlug(verifiedSlug) : null)

  return (
    <GameAssetIcon
      src={resolvedSrc}
      label={label ?? verifiedSlug ?? undefined}
      shape="circle"
      {...rest}
    />
  )
}
