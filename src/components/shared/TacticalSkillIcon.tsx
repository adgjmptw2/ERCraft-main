import { resolveVerifiedTacticalSkillSlug } from '@/assets/loadoutAssetMap'
import { GameAssetIcon, type GameAssetIconProps } from '@/components/shared/GameAssetIcon'
import { loadoutIconUrlFromSlug } from '@/utils/assetUrls'

export interface TacticalSkillIconProps extends Omit<GameAssetIconProps, 'src'> {
  slug?: string | null
  src?: string | null
}

export function TacticalSkillIcon({ slug, src, label, ...rest }: TacticalSkillIconProps) {
  const verifiedSlug = resolveVerifiedTacticalSkillSlug(slug)
  const resolvedSrc = src ?? (verifiedSlug ? loadoutIconUrlFromSlug(verifiedSlug) : null)

  return (
    <GameAssetIcon src={resolvedSrc} label={label ?? verifiedSlug ?? undefined} {...rest} />
  )
}
