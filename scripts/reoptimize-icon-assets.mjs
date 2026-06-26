import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isIconPublicRelativePath } from './lib/iconAssetPaths.mjs'
import {
  DEFAULT_ICON_CONTENT_SCALE,
  DEFAULT_ICON_WEBP_QUALITY,
} from './lib/iconWebpPaddingCore.mjs'
import { createPaddedIconWebpBuffer } from './lib/iconWebpPadding.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ASSETS_ROOT = path.join(ROOT, 'public', 'assets')

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectWebpFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectWebpFiles(fullPath)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.webp')) {
      files.push(fullPath)
    }
  }

  return files
}

async function main() {
  const allWebps = await collectWebpFiles(ASSETS_ROOT)
  const targets = allWebps.filter((file) => {
    const relative = path.relative(ASSETS_ROOT, file)
    return isIconPublicRelativePath(relative)
  })

  if (targets.length === 0) {
    console.log('No icon WebP files found under public/assets/items or public/assets/loadout.')
    return
  }

  let updated = 0

  for (const filePath of targets) {
    // 이미 64px 아이콘을 다시 키우면 좌우가 잘린 것처럼 보인다 — 항상 64 기준으로만 재패딩
    const buffer = await createPaddedIconWebpBuffer(filePath, {
      targetSize: DEFAULT_ICON_TARGET_SIZE,
      contentScale: DEFAULT_ICON_CONTENT_SCALE,
      quality: DEFAULT_ICON_WEBP_QUALITY,
    })

    await fs.writeFile(filePath, buffer)
    updated += 1
  }

  console.log(
    `Re-optimized ${updated} icon WebP file(s) with transparent safe padding (items/loadout only).`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
