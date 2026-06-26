/**
 * BSER characterNum → Fankit CharactER 폴더 번호
 * FANKIT_PATH 가 있으면 폴더 영문명 + BSER l10n 으로 ground-truth 생성
 * 사용: node scripts/generate-character-asset-map.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { FANKIT_EN_TO_L10N } from './lib/fankitCharacterEnAliases.mjs'

const root = resolve(import.meta.dirname, '..')
const koPath = resolve(root, 'src/assets/characterNumToKo.generated.json')
const outPath = resolve(root, 'src/assets/characterNumToAssetFolder.generated.json')

function loadEnvKey() {
  try {
    const envText = readFileSync(resolve(root, 'backend/.env'), 'utf8')
    return envText.match(/BSER_API_KEY=(.+)/)?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

async function loadEnglishL10n() {
  const key = loadEnvKey()
  if (!key) throw new Error('BSER_API_KEY missing in backend/.env')

  const meta = await fetch('https://open-api.bser.io/v1/l10n/English', {
    headers: { accept: 'application/json', 'x-api-key': key },
  }).then((r) => r.json())

  const l10nUrl = meta.data?.l10Path
  if (!l10nUrl) throw new Error('l10Path missing from BSER English l10n metadata')

  const text = await fetch(l10nUrl).then((r) => r.text())
  const enToBser = new Map()

  for (const line of text.split('\n')) {
    if (!line.startsWith('Character/Name/')) continue
    const [keyPart, value] = line.split('┃', 2)
    if (!keyPart || value === undefined) continue
    const code = Number(keyPart.slice('Character/Name/'.length))
    const name = value.trim()
    if (Number.isInteger(code) && code > 0 && name) {
      enToBser.set(name, code)
    }
  }

  return enToBser
}

function resolveBserFromFankitName(enName, enToBser) {
  const direct = enToBser.get(enName)
  if (direct !== undefined) return direct

  const alias = FANKIT_EN_TO_L10N[enName]
  if (alias) {
    const fromAlias = enToBser.get(alias)
    if (fromAlias !== undefined) return fromAlias
  }

  return null
}

function mapFromFankit(fankitRoot, enToBser) {
  const charRoot = resolve(fankitRoot, 'CharactER')
  const entries = readdirSync(charRoot, { withFileTypes: true })
  const characterNumToAssetFolder = {}
  const unmatched = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const match = /^(\d+)\.\s*(.+)$/.exec(entry.name.trim())
    if (!match) continue

    const folder = Number(match[1])
    const enName = match[2].trim()
    if (!Number.isInteger(folder) || folder <= 0 || folder >= 900) continue

    const bser = resolveBserFromFankitName(enName, enToBser)
    if (bser === null) {
      unmatched.push({ folder, enName })
      continue
    }

    characterNumToAssetFolder[String(bser)] = folder
  }

  return { characterNumToAssetFolder, unmatched }
}

async function main() {
  const fankitPath = process.env.FANKIT_PATH?.trim()
  if (!fankitPath) {
    console.error('FANKIT_PATH is required. Example:')
    console.error(
      '  set FANKIT_PATH=D:\\er\\Eternal Return Fankit && node scripts/generate-character-asset-map.mjs',
    )
    process.exit(1)
  }

  const enToBser = await loadEnglishL10n()
  const { characterNumToAssetFolder, unmatched } = mapFromFankit(fankitPath, enToBser)

  const { characterNumToKo } = JSON.parse(readFileSync(koPath, 'utf8'))
  for (const [num, ko] of Object.entries(characterNumToKo)) {
    const n = Number(num)
    if (!Number.isInteger(n) || n <= 0 || n >= 9000) continue
    if (characterNumToAssetFolder[num] === undefined) {
      console.warn(`No Fankit folder for BSER ${n} (${ko})`)
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'BSER characterNum + Fankit CharactER folders (scripts/generate-character-asset-map.mjs)',
    notes: [
      'Fankit 폴더 번호는 출시순이며 BSER characterNum 과 다를 수 있음',
      '쇼우(013)·쇼이치(017)는 각각 전용 폴더 — 013 공유 아님',
      '시셀라/키아라(014·015)는 BSER 14·15 와 폴더가 교차',
    ],
    characterNumToAssetFolder,
  }

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(
    `Wrote ${Object.keys(characterNumToAssetFolder).length} entries → ${outPath}`,
  )
  if (unmatched.length > 0) {
    console.warn(
      `Unmatched Fankit folders (${unmatched.length}):`,
      unmatched
        .slice(0, 8)
        .map((u) => `${u.folder}.${u.enName}`)
        .join(', '),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
