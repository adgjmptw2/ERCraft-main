#!/usr/bin/env node
/**
 * 39.10M/N — 공식 BSER /v1/data/hash + l10n으로 코발트 인퓨전 카탈로그 생성.
 * 서비스 런타임에서 호출하지 않음. BSER_API_KEY는 backend/.env에서 읽음.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = join(ROOT, '.cache', 'cobalt-infusion-discovery')
const OUT_PATH = join(ROOT, 'src', 'data', 'cobaltInfusions.generated.json')
const OVERRIDES_PATH = join(ROOT, 'src', 'data', 'cobaltInfusionAssetOverrides.json')
const OBSERVATION_PATH = join(CACHE_DIR, 'observation-report.json')

const BSER_BASE = 'https://open-api.bser.io'
const MIN_INTERVAL_MS = 1000
const BURST = 2

const PRIMARY_META_TYPES = ['InfusionProduct']
const SECONDARY_META_TYPES = ['Trait', 'CobaltWall']

const BOUGHT_INFUSION_META_CODES = new Set([10001, 10002, 1003, 1004])

function loadApiKey() {
  const envPath = join(ROOT, 'backend', '.env')
  if (!existsSync(envPath)) throw new Error('backend/.env not found')
  const text = readFileSync(envPath, 'utf8')
  const match = text.match(/^BSER_API_KEY=(.+)$/m)
  const key = match?.[1]?.trim()
  if (!key) throw new Error('BSER_API_KEY missing in backend/.env')
  return key
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

class RateLimiter {
  constructor() {
    this.chain = Promise.resolve()
    this.tokens = BURST
    this.lastRefillAt = Date.now()
  }

  refill() {
    const now = Date.now()
    const gained = Math.floor((now - this.lastRefillAt) / MIN_INTERVAL_MS)
    if (gained <= 0) return
    this.tokens = Math.min(BURST, this.tokens + gained)
    this.lastRefillAt += gained * MIN_INTERVAL_MS
  }

  run(fn) {
    const next = this.chain.then(async () => {
      this.refill()
      if (this.tokens <= 0) {
        const wait = this.lastRefillAt + MIN_INTERVAL_MS - Date.now()
        if (wait > 0) await sleep(wait)
        this.refill()
      }
      this.tokens -= 1
      return fn()
    })
    this.chain = next.catch(() => undefined)
    return next
  }
}

const limiter = new RateLimiter()

async function bserRequest(apiKey, path) {
  return limiter.run(async () => {
    const res = await fetch(`${BSER_BASE}${path}`, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
    })
    const body = await res.json()
    const code = body?.code ?? res.status
    if (!res.ok || code !== 200) {
      throw new Error(`BSER ${path} failed: ${code} ${body?.message ?? res.statusText}`)
    }
    return body
  })
}

function cachePath(name) {
  mkdirSync(CACHE_DIR, { recursive: true })
  return join(CACHE_DIR, name)
}

function readCache(name) {
  const path = cachePath(name)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeCache(name, data) {
  writeFileSync(cachePath(name), JSON.stringify(data, null, 2))
}

function summarizeRow(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string') out[key] = value.length > 80 ? `${value.slice(0, 77)}...` : value
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value
    else if (Array.isArray(value)) out[key] = `array(${value.length})`
    else out[key] = typeof value
  }
  return out
}

function pickCandidateMetaTypes(hashData) {
  const raw = hashData?.data
  const names = new Set()
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const name = row?.metaType ?? row?.name
      if (typeof name === 'string' && name.trim()) names.add(name.trim())
    }
  } else if (raw && typeof raw === 'object') {
    for (const key of Object.keys(raw)) {
      if (key.trim()) names.add(key.trim())
    }
  }
  const keywords = ['infusion', 'cobalt', 'trait', 'relic', 'product', 'augment']
  const matched = [...names]
    .filter((name) => keywords.some((kw) => name.toLowerCase().includes(kw)))
    .sort()
  const priority = [
    'InfusionProduct',
    'Trait',
    'CobaltWall',
    'ProductAsset',
    'ShopProduct',
    'ShopProductItem',
  ]
  return [
    ...priority.filter((name) => matched.includes(name)),
    ...matched.filter((name) => !priority.includes(name)),
  ]
}

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\.(png|webp|jpg)$/i, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\./g, ' ')
    .replace(/[''`]/g, "'")
    .replace(/[=]/g, ' ')
    .replace(/\s+mk2$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function loadManifestSlugs() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'assets', 'manifest.json'), 'utf8'))
  return (manifest.loadout ?? []).filter((slug) => slug.startsWith('infusion-cobalt-protocol/'))
}

function matchAssetSlug(enName, koName, slugs) {
  const ASSET_NAME_ALIASES = new Map([
    ['omnivamp', 'painkiller'],
    ['tenacity', 'unwavering mentality'],
    ['spirit culling mk2', 'spirit culling'],
    ['a m d s', 'a m d s'],
    ['immobilizing presence', 'gravitational field'],
    ['모든 피해 흡혈', 'painkiller'],
    ['방해 효과 저항', 'unwavering mentality'],
    ['광견병', 'rabid'],
    ['디스코', 'party rocker'],
    ['수확 mk2', 'spirit culling'],
    ['강림', 'gravitational field'],
    ['수상한 실험', 'suspicious experiment'],
  ])

  const rawTargets = [enName, koName].map(normalizeName).filter(Boolean)
  const targets = []
  for (const target of rawTargets) {
    targets.push(target)
    const alias = ASSET_NAME_ALIASES.get(target)
    if (alias) targets.push(normalizeName(alias))
  }

  const matches = []
  for (const slug of slugs) {
    const base = slug.split('/').pop() ?? ''
    const normalized = normalizeName(base.replace(/-/g, ' '))
    for (const target of targets) {
      if (normalized === target) matches.push(slug)
    }
  }
  return matches.length >= 1 ? matches[0] : null
}

function parseL10n(text) {
  const map = new Map()
  for (const line of text.split('\n')) {
    const sep = line.includes('┃') ? '┃' : line.includes('|') ? '|' : null
    if (!sep) continue
    const [key, value] = line.split(sep, 2)
    if (key && value !== undefined) map.set(key.trim(), value.trim())
  }
  return map
}

async function loadL10n(apiKey, language, cacheName) {
  const cached = readCache(cacheName)
  if (cached) return cached

  const meta = await bserRequest(apiKey, `/v1/l10n/${language}`)
  const url = meta?.data?.l10Path
  if (!url) throw new Error(`${language} l10n path missing`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${language} l10n download failed: ${res.status}`)
  const text = await res.text()
  const map = Object.fromEntries(parseL10n(text))
  writeCache(cacheName, map)
  return map
}

function loadAssetOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return []
  const rows = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'))
  if (!Array.isArray(rows)) return []
  const manifestSlugs = new Set(loadManifestSlugs())
  const seen = new Set()
  const valid = []
  for (const row of rows) {
    if (typeof row?.apiCode !== 'number' || !Number.isInteger(row.apiCode) || row.apiCode <= 0) continue
    if (seen.has(row.apiCode)) throw new Error(`duplicate asset override apiCode: ${row.apiCode}`)
    if (typeof row?.assetSlug !== 'string' || !row.assetSlug.trim()) continue
    if (!manifestSlugs.has(row.assetSlug.trim())) {
      throw new Error(`override assetSlug not in manifest: ${row.assetSlug}`)
    }
    if (typeof row?.evidence !== 'string' || !row.evidence.trim()) {
      throw new Error(`override missing evidence for apiCode ${row.apiCode}`)
    }
    seen.add(row.apiCode)
    valid.push({
      apiCode: row.apiCode,
      assetSlug: row.assetSlug.trim(),
      evidence: row.evidence.trim(),
      verified: row.verified !== false,
    })
  }
  return valid
}

function loadObservedCodes() {
  if (!existsSync(OBSERVATION_PATH)) return new Set()
  const report = JSON.parse(readFileSync(OBSERVATION_PATH, 'utf8'))
  const codes = report?.observedFinalInfusionCodes
  if (!Array.isArray(codes)) return new Set()
  return new Set(codes.filter((code) => typeof code === 'number' && code > 0))
}

function classifyCatalogRole(row) {
  const storeType = typeof row.storeType === 'string' ? row.storeType : ''
  const productType = typeof row.productType === 'string' ? row.productType : ''
  if (BOUGHT_INFUSION_META_CODES.has(row.code)) return 'currency_or_meta'
  if (storeType === 'Relic' || productType.startsWith('Relic_')) return 'relic'
  if (storeType === 'Store' || productType === 'Item' || productType === 'EquipItemSelector') {
    return 'store_meta'
  }
  if (productType === 'Special') return 'special'
  return 'trait_infusion'
}

function resolveUnresolvedReason(row, koName, enName, catalogRole) {
  if (koName || enName) return null
  if (catalogRole === 'currency_or_meta') return 'meta_purchase_key'
  if (catalogRole === 'relic') return 'relic_product_not_final_infusion'
  if (catalogRole === 'store_meta') return 'store_product_not_final_infusion'
  if (row.productGroup === 7900900) return 'missing_l10n_for_product_group_7900900'
  if (!row.icon && !row.simpleIcon) return 'missing_l10n_and_icon_resource'
  return 'missing_current_l10n'
}

function resolveL10nNames(row, l10nKo, l10nEn) {
  const productCode = typeof row.productCode === 'number' ? row.productCode : null
  const productGroup = typeof row.productGroup === 'number' ? row.productGroup : null
  const productType = typeof row.productType === 'string' ? row.productType : ''

  const groupNameKey =
    productGroup !== null && productGroup > 0 ? `CharacterState/Group/Name/${productGroup}` : null
  const traitNameKey = productCode !== null && productCode > 0 ? `Trait/Name/${productCode}` : null
  const specialNameKey =
    productType === 'Special' && productCode !== null
      ? `Infusion/Special/Title/${productCode}`
      : null

  const koGroup = groupNameKey ? l10nKo[groupNameKey] ?? null : null
  const enGroup = groupNameKey ? l10nEn[groupNameKey] ?? null : null
  const koTrait = traitNameKey ? l10nKo[traitNameKey] ?? null : null
  const enTrait = traitNameKey ? l10nEn[traitNameKey] ?? null : null
  const koSpecial = specialNameKey ? l10nKo[specialNameKey] ?? null : null
  const enSpecial = specialNameKey ? l10nEn[specialNameKey] ?? null : null

  const koName = koGroup ?? koSpecial ?? koTrait
  const enName = enGroup ?? enSpecial ?? enTrait

  return {
    productCode,
    productGroup,
    groupNameKey,
    traitNameKey,
    specialNameKey,
    koGroup,
    enGroup,
    koTrait,
    enTrait,
    koSpecial,
    enSpecial,
    koName,
    enName,
    hasCurrentL10n: Boolean(koName || enName),
  }
}

function buildInfusionCatalog(rows, l10nKo, l10nEn, manifestSlugs, assetOverrides, observedCodes) {
  const overrideByCode = new Map(assetOverrides.map((row) => [row.apiCode, row]))
  const entries = []

  for (const row of rows) {
    if (typeof row?.code !== 'number' || !Number.isInteger(row.code) || row.code <= 0) continue

    const names = resolveL10nNames(row, l10nKo, l10nEn)
    const catalogRole = classifyCatalogRole(row)
    const iconResource =
      typeof row.icon === 'string' && row.icon.trim()
        ? row.icon.trim()
        : typeof row.simpleIcon === 'string' && row.simpleIcon.trim()
          ? row.simpleIcon.trim()
          : null

    const autoAssetSlug = matchAssetSlug(names.enGroup ?? names.enSpecial ?? names.enTrait, names.koGroup ?? names.koSpecial ?? names.koTrait, manifestSlugs)
    const override = overrideByCode.get(row.code) ?? null
    const assetSlug = override?.assetSlug ?? autoAssetSlug
    const nameVerified = names.hasCurrentL10n
    const assetVerified = Boolean(assetSlug)
    const observed = observedCodes.has(row.code)

    let resolutionStatus = 'unresolved'
    if (catalogRole === 'currency_or_meta' || catalogRole === 'relic' || catalogRole === 'store_meta') {
      resolutionStatus = 'meta'
    } else if (nameVerified && assetVerified) {
      resolutionStatus = 'resolved'
    } else if (nameVerified) {
      resolutionStatus = 'name_only'
    } else if (observed) {
      resolutionStatus = 'observed_unlocalized'
    }

    const unresolvedReason = resolveUnresolvedReason(row, names.koName, names.enName, catalogRole)

    entries.push({
      apiCode: row.code,
      productCode: names.productCode,
      productGroup: names.productGroup,
      productType: typeof row.productType === 'string' ? row.productType : null,
      storeType: typeof row.storeType === 'string' ? row.storeType : null,
      koName: names.koName,
      enName: names.enName,
      traitKoName: names.koTrait,
      traitEnName: names.enTrait,
      groupKoName: names.koGroup,
      groupEnName: names.enGroup,
      specialKoName: names.koSpecial,
      specialEnName: names.enSpecial,
      nameKey: names.traitNameKey,
      groupNameKey: names.groupNameKey,
      specialNameKey: names.specialNameKey,
      iconResource,
      assetSlug,
      nameVerified,
      assetVerified,
      verified: nameVerified,
      observed,
      catalogRole,
      resolutionStatus,
      unresolvedReason,
      assetOverrideEvidence: override?.evidence ?? null,
      sourceMetaType: 'InfusionProduct',
    })
  }

  return entries.sort((a, b) => a.apiCode - b.apiCode)
}

async function fetchMetaTable(apiKey, metaType, tableSummaries) {
  const cacheName = `data-${metaType}.json`
  let tableBody = readCache(cacheName)
  if (!tableBody) {
    try {
      tableBody = await bserRequest(apiKey, `/v1/data/${encodeURIComponent(metaType)}`)
      writeCache(cacheName, tableBody)
    } catch (error) {
      tableSummaries.push({
        metaType,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }
  const rows = Array.isArray(tableBody?.data) ? tableBody.data : []
  tableSummaries.push({
    metaType,
    rowCount: rows.length,
    sampleFields: rows[0] ? Object.keys(rows[0]).sort() : [],
    sampleRow: summarizeRow(rows[0]),
  })
  return rows
}

async function main() {
  const apiKey = loadApiKey()
  mkdirSync(dirname(OUT_PATH), { recursive: true })

  let hashBody = readCache('data-hash.json')
  if (!hashBody) {
    hashBody = await bserRequest(apiKey, '/v1/data/hash')
    writeCache('data-hash.json', hashBody)
  }

  const candidateMetaTypes = pickCandidateMetaTypes(hashBody)
  const tableSummaries = []

  const infusionRows = await fetchMetaTable(apiKey, 'InfusionProduct', tableSummaries)
  if (infusionRows.length === 0) {
    if (existsSync(OUT_PATH)) {
      const existing = JSON.parse(readFileSync(OUT_PATH, 'utf8'))
      if (Array.isArray(existing.catalog) && existing.catalog.length > 0) {
        throw new Error(
          `InfusionProduct fetch returned 0 rows; refusing to overwrite existing catalog (${existing.catalog.length} entries). Retry later or restore cache.`,
        )
      }
    }
    throw new Error('InfusionProduct fetch returned 0 rows and no existing catalog to preserve')
  }
  for (const metaType of [
    ...SECONDARY_META_TYPES,
    ...candidateMetaTypes.filter(
      (t) => !PRIMARY_META_TYPES.includes(t) && !SECONDARY_META_TYPES.includes(t),
    ),
  ]) {
    if (metaType === 'InfusionProduct') continue
    await fetchMetaTable(apiKey, metaType, tableSummaries)
  }

  const [l10nKo, l10nEn] = await Promise.all([
    loadL10n(apiKey, 'Korean', 'l10n-korean.json'),
    loadL10n(apiKey, 'English', 'l10n-english.json'),
  ])
  const manifestSlugs = loadManifestSlugs()
  const assetOverrides = loadAssetOverrides()
  const observedCodes = loadObservedCodes()
  const catalog = buildInfusionCatalog(
    infusionRows,
    l10nKo,
    l10nEn,
    manifestSlugs,
    assetOverrides,
    observedCodes,
  )

  const classificationSummary = {
    total: catalog.length,
    nameVerified: catalog.filter((e) => e.nameVerified).length,
    assetVerified: catalog.filter((e) => e.assetVerified).length,
    observed: catalog.filter((e) => e.observed).length,
    byCatalogRole: Object.fromEntries(
      [...new Set(catalog.map((e) => e.catalogRole))].map((role) => [
        role,
        catalog.filter((e) => e.catalogRole === role).length,
      ]),
    ),
    byResolutionStatus: Object.fromEntries(
      [...new Set(catalog.map((e) => e.resolutionStatus))].map((status) => [
        status,
        catalog.filter((e) => e.resolutionStatus === status).length,
      ]),
    ),
    unverifiedCodes: catalog.filter((e) => !e.nameVerified).map((e) => e.apiCode),
    observedUnlocalized: catalog
      .filter((e) => e.observed && !e.nameVerified)
      .map((e) => ({ apiCode: e.apiCode, unresolvedReason: e.unresolvedReason })),
  }

  const output = {
    generatedAt: new Date().toISOString(),
    candidateMetaTypes,
    primaryMetaType: 'InfusionProduct',
    tableSummaries,
    classificationSummary,
    catalog,
  }

  writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`)

  console.log(
    JSON.stringify(
      {
        outPath: OUT_PATH,
        candidateMetaTypes,
        classificationSummary,
        code13: catalog.find((e) => e.apiCode === 13) ?? null,
        code27: catalog.find((e) => e.apiCode === 27) ?? null,
        code63: catalog.find((e) => e.apiCode === 63) ?? null,
        code79: catalog.find((e) => e.apiCode === 79) ?? null,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
