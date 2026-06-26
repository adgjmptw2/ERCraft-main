import { resolveVerifiedLoadoutSlug } from '@/assets/loadoutAssetMap'
import { GameAssetIcon, type GameAssetIconProps } from '@/components/shared/GameAssetIcon'
import { loadoutIconUrlFromSlug } from '@/utils/assetUrls'

export interface LoadoutIconProps extends Omit<GameAssetIconProps, 'src'> {
  slug?: string | null
  src?: string | null
}

export function LoadoutIcon({ slug, src, label, ...rest }: LoadoutIconProps) {
  const verifiedSlug = resolveVerifiedLoadoutSlug(slug)
  const resolvedSrc = src ?? (verifiedSlug ? loadoutIconUrlFromSlug(verifiedSlug) : null)

  return <GameAssetIcon src={resolvedSrc} label={label ?? verifiedSlug ?? undefined} {...rest} />
}
