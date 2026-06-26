import fs from 'node:fs/promises'
import path from 'node:path'

import { fankitFileNameToSlug, fankitLabelToSlugSegment } from './fankitSlug.mjs'

const SOURCE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg'])

const ITEM_ROOT_SEGMENTS = {
  '01. Weapons': 'weapons',
  '02. Armor': 'armor',
  '03. Consumables': 'consumables',
  '04. Summon': 'summon',
  '05. Material': 'material',
  '06. Exchangeable': 'exchangeable',
  '00. Gadget': 'gadget',
}

const LOADOUT_ROOT_SEGMENTS = {
  '01. Havoc': 'havoc',
  '02. Chaos': 'chaos',
  '03. Fortification': 'fortification',
  '04. Support': 'support',
  '05. Tactical Skills': 'tactical-skills',
  '06. Infusion_Cobalt Protocol': 'infusion',
}

/**
 * @param {string} fankitRoot
 * @returns {Promise<Map<string, string>>}
 */
export async function buildFankitAssetIndex(fankitRoot) {
  /** @type {Map<string, string>} */
  const bySlug = new Map()

  function add(slug, filePath) {
    if (!slug) return
    const key = slug.toLowerCase()
    if (!bySlug.has(key)) {
      bySlug.set(key, filePath)
    }
    const base = slug.split('/').pop()
    if (base && !bySlug.has(base)) {
      bySlug.set(base, filePath)
    }
  }

  const itemRoot = path.join(fankitRoot, 'Item')
  const loadoutRoot = path.join(fankitRoot, 'Loadout')

  await indexItemTree(itemRoot, add)
  await indexLoadoutTree(loadoutRoot, add)
  await indexLoadoutRootFiles(loadoutRoot, add)

  return bySlug
}

/**
 * @param {string} slug
 * @param {Map<string, string>} index
 */
export function resolveFankitSource(slug, index) {
  const normalized = slug.toLowerCase()
  const direct = index.get(normalized)
  if (direct) return direct

  if (normalized.startsWith('infusion-cobalt-protocol/')) {
    const base = normalized.split('/').pop()
    if (base) {
      const fromInfusion = index.get(`infusion-cobalt-protocol/${base}`)
      if (fromInfusion) return fromInfusion

      const fromFankit = index.get(`infusion/${base}`)
      if (fromFankit) return fromFankit
    }
    return undefined
  }

  const base = normalized.split('/').pop()
  if (base) {
    const hit = index.get(base)
    if (hit) return hit
  }

  return undefined
}

/**
 * @param {string} itemRoot
 * @param {(slug: string, filePath: string) => void} add
 */
async function indexItemTree(itemRoot, add) {
  let itemEntries
  try {
    itemEntries = await fs.readdir(itemRoot, { withFileTypes: true })
  } catch {
    return
  }

  for (const categoryDir of itemEntries) {
    if (!categoryDir.isDirectory()) continue
    const categoryKey = ITEM_ROOT_SEGMENTS[categoryDir.name]
    if (!categoryKey) continue

    const categoryPath = path.join(itemRoot, categoryDir.name)
    const subEntries = await fs.readdir(categoryPath, { withFileTypes: true })

    for (const sub of subEntries) {
      const subPath = path.join(categoryPath, sub.name)
      if (sub.isDirectory()) {
        const subSlug = fankitLabelToSlugSegment(sub.name)
        const files = await collectImages(subPath)
        for (const filePath of files) {
          const fileSlug = fankitFileNameToSlug(path.basename(filePath))
          add(`${categoryKey}/${subSlug}/${fileSlug}`, filePath)
        }
        continue
      }

      if (sub.isFile() && isImage(sub.name)) {
        const fileSlug = fankitFileNameToSlug(sub.name)
        add(`${categoryKey}/${fileSlug}`, subPath)
      }
    }
  }
}

/**
 * @param {string} loadoutRoot
 * @param {(slug: string, filePath: string) => void} add
 */
async function indexLoadoutTree(loadoutRoot, add) {
  let entries
  try {
    entries = await fs.readdir(loadoutRoot, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const groupSlug = LOADOUT_ROOT_SEGMENTS[entry.name]
    if (!groupSlug) continue

    const groupPath = path.join(loadoutRoot, entry.name)
    const files = await collectImages(groupPath)
    for (const filePath of files) {
      const fileSlug = fankitFileNameToSlug(path.basename(filePath))
      if (groupSlug === 'tactical-skills') {
        add(`tactical-skills/${fileSlug}`, filePath)
      } else if (groupSlug === 'infusion') {
        add(`infusion/${fileSlug}`, filePath)
        add(`infusion-cobalt-protocol/${fileSlug}`, filePath)
      } else {
        add(`${groupSlug}/${fileSlug}`, filePath)
      }
    }
  }
}

/**
 * Loadout 루트 Cube_*.png 등
 * @param {string} loadoutRoot
 * @param {(slug: string, filePath: string) => void} add
 */
async function indexLoadoutRootFiles(loadoutRoot, add) {
  let entries
  try {
    entries = await fs.readdir(loadoutRoot, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isImage(entry.name)) continue
    const base = entry.name.replace(/\.[^.]+$/, '')
    const slug = base.toLowerCase().replace(/_/g, '-')
    add(slug, path.join(loadoutRoot, entry.name))
  }
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectImages(dir) {
  /** @type {string[]} */
  const files = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectImages(full)))
      continue
    }
    if (entry.isFile() && isImage(entry.name)) {
      files.push(full)
    }
  }
  return files
}

/**
 * @param {string} name
 */
function isImage(name) {
  return SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase())
}
