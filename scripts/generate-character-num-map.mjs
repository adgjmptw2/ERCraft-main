/**
 * BSER Open API Korean l10n → characterNumToKo.generated.json
 * 사용: node scripts/generate-character-num-map.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outPath = resolve(root, 'src/assets/characterNumToKo.generated.json')

function loadEnvKey() {
  try {
    const envText = readFileSync(resolve(root, 'backend/.env'), 'utf8')
    return envText.match(/BSER_API_KEY=(.+)/)?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

async function main() {
  const key = loadEnvKey()
  if (!key) throw new Error('BSER_API_KEY missing in backend/.env')

  const meta = await fetch('https://open-api.bser.io/v1/l10n/Korean', {
    headers: { accept: 'application/json', 'x-api-key': key },
  }).then((r) => r.json())

  const l10nUrl = meta.data?.l10Path
  if (!l10nUrl) throw new Error('l10Path missing from BSER l10n metadata')

  const text = await fetch(l10nUrl).then((r) => r.text())
  const characterNumToKo = {}

  for (const line of text.split('\n')) {
    if (!line.startsWith('Character/Name/')) continue
    const [keyPart, value] = line.split('┃', 2)
    if (!keyPart || value === undefined) continue
    const code = Number(keyPart.slice('Character/Name/'.length))
    const name = value.trim()
    if (Number.isInteger(code) && code > 0 && name) {
      characterNumToKo[code] = name
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'BSER Open API l10n/Korean Character/Name/*',
    characterNumToKo,
  }

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(characterNumToKo).length} entries → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
