/**
 * @param {number} targetSize
 * @param {number} [contentScale]
 */
export function computePaddedIconSizes(targetSize, contentScale = 0.82) {
  if (!Number.isFinite(targetSize) || targetSize <= 0) {
    throw new Error(`targetSize must be a positive number, got ${targetSize}`)
  }
  if (!Number.isFinite(contentScale) || contentScale <= 0 || contentScale > 1) {
    throw new Error(`contentScale must be in (0, 1], got ${contentScale}`)
  }

  const safeSize = Math.round(targetSize * contentScale)
  const padPx = Math.floor((targetSize - safeSize) / 2)
  const marginPercentPerSide = (padPx / targetSize) * 100

  return {
    targetSize,
    contentScale,
    safeSize,
    padPx,
    marginPercentPerSide,
  }
}

export const DEFAULT_ICON_TARGET_SIZE = 64
export const DEFAULT_ICON_CONTENT_SCALE = 0.82
export const DEFAULT_ICON_WEBP_QUALITY = 85
