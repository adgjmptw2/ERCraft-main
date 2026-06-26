/**
 * BSER ItemArmor/ItemWeapon + manifest로 itemCodeToSlug 누락분 보강 목록 생성
 * 사용: node scripts/generate-missing-item-slugs.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mapsPath = resolve(root, 'src/assets/erCodeMaps.generated.json')
const manifestPath = resolve(root, 'public/assets/manifest.json')

function loadEnvKey() {
  const envText = readFileSync(resolve(root, 'backend/.env'), 'utf8')
  return envText.match(/BSER_API_KEY=(.+)/)?.[1]?.trim() ?? ''
}

/** BSER 한국어 이름 + manifest slug 수동 확정 (자동 추측 금지) */
const MANUAL_OVERRIDES = {
  201403: 'armor/head/mithril-helm',
  202407: 'armor/chest/mithril-armor',
  202421: 'armor/chest/mithril-crop',
  202509: 'armor/chest/beautiful-garnment',
  203404: 'armor/arm-accessory/mithril-shield',
  203405: 'armor/arm-accessory/vital-sign-censor',
  204407: 'armor/leg/mithril-boots',
  204415: 'armor/leg/scv-self-controlled-vehicle',
  103404: 'weapons/dual-swords/deadly-butterfly',
  103502: 'weapons/dual-swords/lioigor-zahr',
  103506: 'weapons/dual-swords/twin-swords',
  107403: 'weapons/spear/eighteen-foor-spear',
  109405: 'weapons/whip/cathod-lash',
  109503: 'weapons/whip/whip',
  110412: 'weapons/glove/imperial-skil-gloves',
  110701: 'weapons/glove/bloody-hand',
  110702: 'weapons/glove/bloody-hand',
  111701: 'weapons/tonfa/blade-tonfa',
  111702: 'weapons/tonfa/blade-tonfa',
  116409: 'weapons/pistol/stempede',
  116701: 'weapons/pistol/high-noon',
  116702: 'weapons/pistol/high-noon',
  120701: 'weapons/rapier/nosferatu',
  120702: 'weapons/rapier/nosferatu',
  121701: 'weapons/guitar/heartbreaker',
  121702: 'weapons/guitar/heartbreaker',
  122405: 'weapons/camera/polaroid-camera',
  122701: 'weapons/camera/vision-flex',
  122702: 'weapons/camera/vision-flex',
}

const WEAPON_TYPE_TO_PREFIX = {
  Dagger: 'weapons/dagger/',
  TwoHandSword: 'weapons/two-handed-sword/',
  DualSword: 'weapons/dual-swords/',
  Hammer: 'weapons/hammer/',
  Axe: 'weapons/axe/',
  Spear: 'weapons/spear/',
  Bat: 'weapons/bat/',
  Whip: 'weapons/whip/',
  Glove: 'weapons/glove/',
  Tonfa: 'weapons/tonfa/',
  Throwing: 'weapons/throw/',
  Shuriken: 'weapons/shuriken/',
  Bow: 'weapons/bow/',
  Crossbow: 'weapons/crossbow/',
  Pistol: 'weapons/pistol/',
  AssaultRifle: 'weapons/assault-rifle/',
  SniperRifle: 'weapons/sniper-rifle/',
  Nunchaku: 'weapons/nunchaku/',
  Rapier: 'weapons/rapier/',
  Guitar: 'weapons/guitar/',
  Camera: 'weapons/camera/',
  Arcana: 'weapons/arcana/',
  VFProsthetic: 'weapons/vf-prosthetic/',
}

async function fetchData(path, key) {
  const res = await fetch(`https://open-api.bser.io/v2/data/${path}`, {
    headers: { accept: 'application/json', 'x-api-key': key },
  })
  const json = await res.json()
  return json.data ?? []
}

function weaponPrefix(item) {
  return WEAPON_TYPE_TO_PREFIX[item.weaponType] ?? null
}

function main() {
  return (async () => {
    const key = loadEnvKey()
    if (!key) throw new Error('BSER_API_KEY missing in backend/.env')

    const maps = JSON.parse(readFileSync(mapsPath, 'utf8'))
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const verified = new Set(manifest.items)
    const slugToCode = new Map(
      Object.entries(maps.itemCodeToSlug).map(([code, slug]) => [slug, Number(code)]),
    )

    const [armor, weapon] = await Promise.all([
      fetchData('ItemArmor', key),
      fetchData('ItemWeapon', key),
    ])
    const byCode = new Map([...armor, ...weapon].map((item) => [item.code, item]))

    const koToSlug = new Map()
    for (const [code, slug] of Object.entries(maps.itemCodeToSlug)) {
      const item = byCode.get(Number(code))
      if (item?.name) koToSlug.set(item.name, slug)
    }

    const additions = {}
    const unresolved = []

    for (const codeStr of Object.keys(maps.itemCodeToGrade)) {
      if (maps.itemCodeToSlug[codeStr]) continue

      const code = Number(codeStr)
      if (MANUAL_OVERRIDES[code]) {
        additions[codeStr] = MANUAL_OVERRIDES[code]
        continue
      }

      const item = byCode.get(code)
      if (!item) continue

      const byKo = koToSlug.get(item.name)
      if (byKo && verified.has(byKo)) {
        additions[codeStr] = byKo
        continue
      }

      unresolved.push({
        code: codeStr,
        name: item.name,
        grade: maps.itemCodeToGrade[codeStr],
        weaponType: item.weaponType ?? item.armorType,
      })
    }

    const merged = { ...maps.itemCodeToSlug, ...additions }
    const sorted = Object.fromEntries(
      Object.entries(merged).sort(([a], [b]) => Number(a) - Number(b)),
    )

    maps.itemCodeToSlug = sorted
    writeFileSync(mapsPath, `${JSON.stringify(maps, null, 2)}\n`, 'utf8')

    console.log(`Added ${Object.keys(additions).length} mappings`)
    console.log('Additions:', additions)
    console.log(`Unresolved: ${unresolved.length}`)
    for (const row of unresolved) console.log(row)
  })()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
