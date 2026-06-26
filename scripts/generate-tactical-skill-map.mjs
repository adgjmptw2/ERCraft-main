/**
 * BSER TacticalSkillSet + er-gamedata Korean l10n → tacticalSkillGroupToSlug 갱신
 * 사용: node scripts/generate-tactical-skill-map.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mapsPath = resolve(root, 'src/assets/erCodeMaps.generated.json')

const KO_TO_SLUG = {
  블링크: 'blink',
  퀘이크: 'quake',
  '프로토콜 위반': 'protocol-violation',
  '붉은 폭풍': 'electric-shift',
  초월: 'force-field',
  아티팩트: 'totem',
  무효화: 'nullification',
  '강한 결속': 'soul-stealer',
  '스트라이더 - A13': 'the-strijder',
  '진실의 칼날': 'blade-of-truth',
  '치유의 바람': 'healing-wind',
  '리펄서 미사일': 'repulsor-missiles',
  '플라즈마 대시': 'plasma-dash',
  '라이트 윙': 'wings-of-light',
  부착: 'lock-ontracker',
  '힘껏 펀치': 'fantastical-punch',
  '거짓 서약': 'false-oath',
}

function loadEnvKey() {
  const envText = readFileSync(resolve(root, 'backend/.env'), 'utf8')
  return envText.match(/BSER_API_KEY=(.+)/)?.[1]?.trim() ?? ''
}

function skillGroupId(skillCode) {
  return Math.floor(Number(String(skillCode).split(',')[0]) / 10) * 10
}

async function main() {
  const key = loadEnvKey()
  if (!key) throw new Error('BSER_API_KEY missing in backend/.env')

  const headers = { accept: 'application/json', 'x-api-key': key }
  const [setsRes, l10nRes] = await Promise.all([
    fetch('https://open-api.bser.io/v2/data/TacticalSkillSet', { headers }).then((r) => r.json()),
    fetch('https://raw.githubusercontent.com/pypy-vrc/er-gamedata/master/l10n/Korean.txt'),
  ])
  const sets = setsRes.data ?? []
  const l10n = await l10nRes.text()

  const groupNames = new Map()
  for (const line of l10n.split('\n')) {
    const match = line.match(/^Skill\/Group\/Name\/(\d+)┃(.+)\r?$/)
    if (match) groupNames.set(Number(match[1]), match[2])
  }

  const map = {}
  for (const row of sets) {
    if (row.code >= 1_000_000) continue
    const group = Math.floor(row.code / 10) * 10
    const ko = groupNames.get(skillGroupId(row.skillCode))
    const slug = ko ? KO_TO_SLUG[ko] : undefined
    if (slug) map[String(group)] = `tactical-skills/${slug}`
  }

  const maps = JSON.parse(readFileSync(mapsPath, 'utf8'))
  maps.tacticalSkillGroupToSlug = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => Number(a) - Number(b)),
  )
  writeFileSync(mapsPath, `${JSON.stringify(maps, null, 2)}\n`, 'utf8')
  console.log(`Updated ${Object.keys(map).length} tactical skill groups`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
