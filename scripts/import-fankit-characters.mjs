import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { fankitCharacterNumFromFolder } from './lib/fankitSlug.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ASSETS_ROOT = path.join(ROOT, 'public', 'assets', 'characters')
const MANIFEST_PATH = path.join(ROOT, 'public', 'assets', 'manifest.json')


const SKILL_FILE_MAP = [
  { pattern: /(?:^|_)p(?:assive)?(?:_|\.|$)/i, out: 'passive' },
  { pattern: /q2/i, out: 'q2' },
  { pattern: /(?:^|_)q1?(?:_|\.|$)/i, out: 'q' },
  { pattern: /(?:^|_)w(?:_|\.|$)/i, out: 'w' },
  { pattern: /(?:^|_)e(?:1|2)?(?:_|\.|$)/i, out: 'e' },
  { pattern: /(?:^|_)r(?:_|\.|$)/i, out: 'r' },
  { pattern: /(?:^|_)t(?:_|\.|$)/i, out: 't' },
]

/**
 * @param {string} inputPath
 * @param {string} outputPath
 */
async function convertPortraitPng(inputPath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await sharp(inputPath).webp({ quality: 90 }).toFile(outputPath)
}

/**
 * @param {string} fileName
 */
function portraitVariant(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '')
  let kind = null
  if (/(?:^|_)mini(?:_|$)/i.test(base)) kind = 'mini'
  else if (/(?:^|_)half(?:_|$)/i.test(base)) kind = 'half'
  else if (/(?:^|_)full(?:_|$)/i.test(base)) kind = 'full'
  if (!kind) return null

  const indexMatch = /_(\d+)$/.exec(base) ?? /(\d+)$/.exec(base)
  const index = indexMatch ? Number(indexMatch[1]) : 0
  return { kind, index }
}

/**
 * @param {string} fileName
 */
function skillOutputName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '')
  for (const entry of SKILL_FILE_MAP) {
    if (entry.pattern.test(base)) return entry.out
  }
  return null
}

/**
 * @param {string} charDir
 * @param {number} characterNum
 */
async function importCharacterDir(charDir, characterNum) {
  const outDir = path.join(ASSETS_ROOT, String(characterNum))
  let portraits = 0
  let skills = 0

  const entries = await fs.readdir(charDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(charDir, entry.name)
    if (!entry.isDirectory()) continue

    if (/skill/i.test(entry.name)) {
      const skillFiles = await fs.readdir(fullPath)
      for (const file of skillFiles) {
        if (!/\.(png|webp|jpe?g)$/i.test(file)) continue
        const outName = skillOutputName(file)
        if (!outName) continue
        await convertPortraitPng(path.join(fullPath, file), path.join(outDir, 'skills', `${outName}.webp`))
        skills += 1
      }
      continue
    }

    if (!/^\d+\./.test(entry.name)) continue

    const skinFiles = await fs.readdir(fullPath)
    for (const file of skinFiles) {
      if (!/\.(png|webp|jpe?g)$/i.test(file)) continue
      const variant = portraitVariant(file)
      if (!variant) continue
      const dest = path.join(outDir, `${variant.kind}-${variant.index}.webp`)
      await convertPortraitPng(path.join(fullPath, file), dest)
      portraits += 1

      if (variant.kind === 'mini' && variant.index === 0) {
        await convertPortraitPng(path.join(fullPath, file), path.join(ASSETS_ROOT, `${characterNum}.webp`))
      }
    }
  }

  return { portraits, skills }
}

async function importCharactersFromFankit(fankitRoot) {
  const charRoot = path.join(fankitRoot, 'CharactER')
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))
  const expected = new Set(manifest.characters ?? [])

  const entries = await fs.readdir(charRoot, { withFileTypes: true })
  let imported = 0
  let skipped = 0
  /** @type {number[]} */
  const missingPortrait = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const characterNum = fankitCharacterNumFromFolder(entry.name)
    if (characterNum === null || characterNum >= 900) continue

    const result = await importCharacterDir(path.join(charRoot, entry.name), characterNum)
    if (result.portraits === 0 && result.skills === 0) {
      skipped += 1
      continue
    }
    imported += 1

    const mini0 = path.join(ASSETS_ROOT, String(characterNum), 'mini-0.webp')
    try {
      await fs.access(mini0)
    } catch {
      if (expected.has(characterNum)) {
        missingPortrait.push(characterNum)
      }
    }
  }

  console.log(
    `Character import: ${imported} folder(s), ${skipped} skipped, ${missingPortrait.length} without mini-0`,
  )
  if (missingPortrait.length > 0) {
    console.log('Missing mini-0 for:', missingPortrait.slice(0, 20).join(', '))
  }
}

async function main() {
  const fankitPath = process.env.FANKIT_PATH?.trim()
  if (!fankitPath) {
    console.error('FANKIT_PATH is required. Example:')
    console.error('  set FANKIT_PATH=D:\\er\\Eternal Return Fankit && npm run assets:import-fankit:characters')
    process.exit(1)
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

  await importCharactersFromFankit(fankitPath)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
