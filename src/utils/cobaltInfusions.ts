import generated from '@/data/cobaltInfusions.generated.json'
import productCodesJson from '@/data/cobaltInfusionProductCodes.json'
import assetOverrides from '@/data/cobaltInfusionAssetOverrides.json'
import productGroupAssets from '@/data/cobaltInfusionProductGroupAssets.json'
import manifest from '@/assets/manifest.json'
import { loadoutIconUrlFromSlug, normalizeAssetSlug } from '@/utils/assetUrls'

export interface CobaltInfusionAssetOverride {
  apiCode: number
  assetSlug: string
  evidence: string
  verified: boolean
}

export interface CobaltInfusionCatalogEntry {
  apiCode: number
  productCode: number | null
  productGroup: number | null
  productType: string | null
  storeType: string | null
  koName: string | null
  enName: string | null
  traitKoName: string | null
  traitEnName: string | null
  groupKoName: string | null
  groupEnName: string | null
  specialKoName?: string | null
  specialEnName?: string | null
  nameKey: string | null
  groupNameKey: string | null
  specialNameKey?: string | null
  iconResource: string | null
  assetSlug: string | null
  nameVerified: boolean
  assetVerified: boolean
  verified: boolean
  observed?: boolean
  catalogRole?: string
  resolutionStatus?: string
  unresolvedReason?: string | null
  sourceMetaType: string
}

export interface CobaltInfusionResolved {
  code: number
  nameKo: string
  nameEn: string | null
  assetPath: string | null
  isKnown: boolean
  verified: boolean
}

export const BOUGHT_INFUSION_META_CODES: ReadonlySet<number> = new Set([
  10001, 10002, 1003, 1004,
])

const VERIFIED_COBALT_INFUSION_SLUGS: ReadonlySet<string> = new Set(
  (manifest.loadout ?? []).filter((slug) => slug.startsWith('infusion-cobalt-protocol/')),
)

const CATALOG_BY_CODE = new Map<number, CobaltInfusionCatalogEntry>(
  (generated.catalog as CobaltInfusionCatalogEntry[]).map((entry) => [entry.apiCode, entry]),
)

const CATALOG_BY_PRODUCT_CODE = new Map<number, CobaltInfusionCatalogEntry>()
for (const entry of generated.catalog as CobaltInfusionCatalogEntry[]) {
  if (entry.productCode != null && entry.productCode > 0) {
    CATALOG_BY_PRODUCT_CODE.set(entry.productCode, entry)
  }
}

const KNOWN_INFUSION_PRODUCT_CODES: ReadonlySet<number> = new Set(productCodesJson.productCodes)

/** BSER finalInfusion — InfusionProduct.code / productCode / trait-style 7000xxx */
function lookupCatalogEntry(
  rawCode: number,
): { entry: CobaltInfusionCatalogEntry | undefined; apiCode: number } {
  const direct = CATALOG_BY_CODE.get(rawCode)
  if (direct) return { entry: direct, apiCode: rawCode }

  const byProduct = CATALOG_BY_PRODUCT_CODE.get(rawCode)
  if (byProduct) return { entry: byProduct, apiCode: byProduct.apiCode }

  if (rawCode >= 7_000_000 && rawCode < 7_100_000) {
    const traitMapped = CATALOG_BY_PRODUCT_CODE.get(rawCode + 900_000)
    if (traitMapped) return { entry: traitMapped, apiCode: traitMapped.apiCode }
  }

  return { entry: undefined, apiCode: rawCode }
}

const ASSET_OVERRIDE_BY_CODE = new Map<number, CobaltInfusionAssetOverride>(
  (assetOverrides as CobaltInfusionAssetOverride[]).map((entry) => [entry.apiCode, entry]),
)

const PRODUCT_GROUP_TO_ASSET_SLUG = productGroupAssets.productGroupToAssetSlug as Record<
  string,
  string
>
const GROUP_EN_NAME_TO_ASSET_SLUG = productGroupAssets.groupEnNameToAssetSlug as Record<
  string,
  string
>
const SPECIAL_PRODUCT_CODE_TO_ASSET_SLUG =
  productGroupAssets.specialProductCodeToAssetSlug as Record<string, string>

function resolveMappedAssetSlug(entry: CobaltInfusionCatalogEntry): string | null {
  if (entry.productGroup != null && entry.productGroup > 0) {
    const fromGroup = PRODUCT_GROUP_TO_ASSET_SLUG[String(entry.productGroup)]
    if (fromGroup) return fromGroup
  }
  if (entry.groupEnName) {
    const fromEnName = GROUP_EN_NAME_TO_ASSET_SLUG[entry.groupEnName]
    if (fromEnName) return fromEnName
  }
  if (entry.productCode != null && entry.productCode > 0) {
    const fromProductCode = SPECIAL_PRODUCT_CODE_TO_ASSET_SLUG[String(entry.productCode)]
    if (fromProductCode) return fromProductCode
  }
  return null
}

export function isBoughtInfusionMetaKey(
  code: number | string | null | undefined,
): boolean {
  if (code === null || code === undefined) return false
  const value = typeof code === 'number' ? code : Number(code)
  if (!Number.isFinite(value) || !Number.isInteger(value)) return false
  return BOUGHT_INFUSION_META_CODES.has(value)
}

export function isFinalInfusionDisplayCode(
  code: number | string | null | undefined,
): boolean {
  const parsed = parseCobaltInfusionCode(code)
  if (parsed === null) return false
  if (isBoughtInfusionMetaKey(parsed)) return false
  if (parsed >= 7_900_000 && parsed < 7_930_000 && !KNOWN_INFUSION_PRODUCT_CODES.has(parsed)) {
    return false
  }
  const { entry } = lookupCatalogEntry(parsed)
  if (
    entry?.catalogRole === 'currency_or_meta' ||
    entry?.catalogRole === 'relic' ||
    entry?.catalogRole === 'store_meta'
  ) {
    return false
  }
  return true
}

export function listUnresolvedCobaltInfusionCodes(codes: Iterable<number>): number[] {
  const unresolved: number[] = []
  for (const code of codes) {
    if (!isFinalInfusionDisplayCode(code)) continue
    const { entry, apiCode } = lookupCatalogEntry(code)
    if (!entry?.nameVerified) unresolved.push(apiCode)
  }
  return unresolved.sort((a, b) => a - b)
}

export function parseCobaltInfusionCode(
  code: number | string | null | undefined,
): number | null {
  if (code === null || code === undefined) return null
  const value = typeof code === 'number' ? code : Number(code)
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null
  if (BOUGHT_INFUSION_META_CODES.has(value)) return null
  return value
}

function resolveVerifiedAssetPath(assetSlug: string | null | undefined): string | null {
  if (!assetSlug) return null
  const normalized = normalizeAssetSlug(assetSlug.trim())
  if (!normalized || !VERIFIED_COBALT_INFUSION_SLUGS.has(normalized)) return null
  return loadoutIconUrlFromSlug(normalized)
}

function resolveCatalogAssetSlug(entry: CobaltInfusionCatalogEntry): string | null {
  const override = ASSET_OVERRIDE_BY_CODE.get(entry.apiCode)
  if (override?.verified && override.assetSlug) {
    const normalized = normalizeAssetSlug(override.assetSlug.trim())
    if (normalized && VERIFIED_COBALT_INFUSION_SLUGS.has(normalized)) return normalized
  }
  if (entry.assetSlug) {
    const normalized = normalizeAssetSlug(entry.assetSlug.trim())
    if (normalized && VERIFIED_COBALT_INFUSION_SLUGS.has(normalized)) return normalized
  }
  const mapped = resolveMappedAssetSlug(entry)
  if (!mapped) return null
  const normalized = normalizeAssetSlug(mapped.trim())
  if (!normalized || !VERIFIED_COBALT_INFUSION_SLUGS.has(normalized)) return null
  return normalized
}

function pickDisplayNames(
  parsed: number,
  entry: CobaltInfusionCatalogEntry | undefined,
): { nameKo: string; nameEn: string | null; nameVerified: boolean } {
  if (entry?.nameVerified) {
    if (entry.koName) {
      return { nameKo: entry.koName, nameEn: entry.enName, nameVerified: true }
    }
    if (entry.enName) {
      return { nameKo: entry.enName, nameEn: entry.enName, nameVerified: true }
    }
  }
  return {
    nameKo: `인퓨전 ${parsed}`,
    nameEn: null,
    nameVerified: false,
  }
}

export function resolveCobaltInfusion(
  code: number | string | null | undefined,
): CobaltInfusionResolved | null {
  const parsed = parseCobaltInfusionCode(code)
  if (parsed === null) return null
  if (!isFinalInfusionDisplayCode(parsed)) return null

  const { entry, apiCode } = lookupCatalogEntry(parsed)
  const names = pickDisplayNames(apiCode, entry)
  const assetSlug = entry ? resolveCatalogAssetSlug(entry) : null

  return {
    code: apiCode,
    nameKo: names.nameKo,
    nameEn: names.nameEn,
    assetPath: resolveVerifiedAssetPath(assetSlug),
    isKnown: names.nameVerified,
    verified: names.nameVerified,
  }
}

export function cobaltInfusionDisplayLabel(
  code: number | string | null | undefined,
): string {
  return resolveCobaltInfusion(code)?.nameKo ?? '인퓨전'
}

export function cobaltInfusionAssetSlug(
  code: number | string | null | undefined,
): string | null {
  const parsed = parseCobaltInfusionCode(code)
  if (parsed === null) return null
  const { entry } = lookupCatalogEntry(parsed)
  if (!entry) return null
  return resolveCatalogAssetSlug(entry)
}

export function cobaltInfusionIconUrl(
  code: number | string | null | undefined,
): string | null {
  return resolveCobaltInfusion(code)?.assetPath ?? null
}

export function cobaltInfusionIconUrlCandidates(
  code: number | string | null | undefined,
): string[] {
  const url = cobaltInfusionIconUrl(code)
  return url ? [url] : []
}
