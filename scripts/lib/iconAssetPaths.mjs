import path from 'node:path'

export const ICON_PUBLIC_DIRS = ['items', 'loadout']

export function isIconPublicRelativePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.startsWith('characters/')) return false
  if (normalized.startsWith('tiers/')) return false
  if (normalized.startsWith('brand/')) return false
  if (normalized.startsWith('skins/')) return false
  return ICON_PUBLIC_DIRS.some((dir) => normalized.startsWith(`${dir}/`) || normalized === dir)
}

export function slugToCategoryWebpPath(assetsRoot, category, slug) {
  const parts = slug.split('/')
  return path.join(assetsRoot, category, ...parts.slice(0, -1), `${parts[parts.length - 1]}.webp`)
}
