import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import {
  DEFAULT_ICON_CONTENT_SCALE,
  DEFAULT_ICON_TARGET_SIZE,
  DEFAULT_ICON_WEBP_QUALITY,
  computePaddedIconSizes,
} from './iconWebpPaddingCore.mjs'

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{
 *   targetSize?: number
 *   contentScale?: number
 *   quality?: number
 * }} [options]
 */
export async function createPaddedIconWebpBuffer(inputPath, options = {}) {
  const targetSize = options.targetSize ?? DEFAULT_ICON_TARGET_SIZE
  const contentScale = options.contentScale ?? DEFAULT_ICON_CONTENT_SCALE
  const quality = options.quality ?? DEFAULT_ICON_WEBP_QUALITY

  const { safeSize, padPx } = computePaddedIconSizes(targetSize, contentScale)

  const resized = await sharp(inputPath)
    .resize(safeSize, safeSize, {
      fit: 'contain',
      background: TRANSPARENT,
    })
    .toBuffer()

  return sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{ input: resized, top: padPx, left: padPx }])
    .webp({ quality })
    .toBuffer()
}

export async function createPaddedIconWebp(inputPath, outputPath, options = {}) {
  const buffer = await createPaddedIconWebpBuffer(inputPath, options)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, buffer)
}

export async function resolveIconTargetSize(inputPath, fallbackSize = DEFAULT_ICON_TARGET_SIZE) {
  const metadata = await sharp(inputPath).metadata()
  const width = metadata.width ?? fallbackSize
  const height = metadata.height ?? fallbackSize
  return Math.max(width, height, 1)
}
