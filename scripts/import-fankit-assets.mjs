import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildFankitAssetIndex, resolveFankitSource } from './lib/fankitItemIndex.mjs'
import { slugToCategoryWebpPath } from './lib/iconAssetPaths.mjs'
import {
  DEFAULT_ICON_CONTENT_SCALE,
  DEFAULT_ICON_TARGET_SIZE,
  DEFAULT_ICON_WEBP_QUALITY,
} from './lib/iconWebpPaddingCore.mjs'
import { createPaddedIconWebp } from './lib/iconWebpPadding.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ASSETS_ROOT = path.join(ROOT, 'public', 'assets')
const MANIFEST_PATH = path.join(ASSETS_ROOT, 'manifest.json')

async function importIconsFromFankit(fankitPath) {
  const manifestRaw = await fs.readFile(MANIFEST_PATH, 'utf8')
  const manifest = JSON.parse(manifestRaw)
  const sourceIndex = await buildFankitAssetIndex(fankitPath)

  let imported = 0
  let skipped = 0
  /** @type {string[]} */
  const missing = []

  for (const category of ['items', 'loadout']) {
    const slugs = manifest[category]
    if (!Array.isArray(slugs)) continue

    for (const slug of slugs) {
      const sourcePath = resolveFankitSource(slug, sourceIndex)
      if (!sourcePath) {
        skipped += 1
        missing.push(slug)
        continue
      }

      const outputPath = slugToCategoryWebpPath(ASSETS_ROOT, category, slug)

      await createPaddedIconWebp(sourcePath, outputPath, {
        targetSize: DEFAULT_ICON_TARGET_SIZE,
        contentScale: DEFAULT_ICON_CONTENT_SCALE,
        quality: DEFAULT_ICON_WEBP_QUALITY,
      })
      imported += 1
    }
  }

  console.log(`Fankit item/loadout import: ${imported} written, ${skipped} without source.`)
  if (missing.length > 0) {
    console.log('First missing slugs:', missing.slice(0, 15).join(', '))
  }
}

async function main() {
  const fankitPath = process.env.FANKIT_PATH?.trim()

  if (!fankitPath) {
    console.log('FANKIT_PATH is not set. Skipping Fankit import.')
    console.log('Example:')
    console.log('  set FANKIT_PATH=D:\\er\\Eternal Return Fankit && npm run assets:import-fankit')
    return
  }

  try {
    const stat = await fs.stat(fankitPath)
    if (!stat.isDirectory()) {
      console.error(`FANKIT_PATH is not a directory: ${fankitPath}`)
      process.exit(1)
    }
  } catch {
    console.error(`FANKIT_PATH does not exist: ${fankitPath}`)
    process.exit(1)
  }

  await importIconsFromFankit(fankitPath)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
