import generated from '@/assets/erCodeMaps.generated.json'
import manifest from '@/assets/manifest.json'
import { normalizeAssetSlug } from '@/utils/assetUrls'

/** er-gamedata l10n + manifest 교차 검증으로 생성된 아이템 코드 맵 */
export const ITEM_CODE_TO_SLUG: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(generated.itemCodeToSlug).map(([code, slug]) => [Number(code), slug]),
)

const ITEM_CODE_TO_GRADE = generated.itemCodeToGrade as Readonly<Record<string, string>>

/** manifest import 기준 존재 확인된 slug (UI 노출 허용 목록) */
export const VERIFIED_ITEM_SLUGS: ReadonlySet<string> = new Set(manifest.items)

/**
 * 혈액 인챈트 변형(예: 101701·101702) — itemCodeToSlug에 없을 때
 * 같은 무기군의 혈액 등급 기본 아이템 아이콘을 쓴다.
 */
function resolveBloodEnchantVariantSlug(code: number): string | null {
  const codeKey = String(code)
  if (ITEM_CODE_TO_GRADE[codeKey] !== 'blood') return null
  if (!codeKey.endsWith('701') && !codeKey.endsWith('702')) return null

  const prefix = codeKey.slice(0, 3)
  const bloodEntries = Object.entries(ITEM_CODE_TO_SLUG)
    .filter(([itemCode]) => {
      if (!itemCode.startsWith(prefix)) return false
      return ITEM_CODE_TO_GRADE[itemCode] === 'blood'
    })
    .sort(([a], [b]) => Number(a) - Number(b))

  if (bloodEntries.length === 0) return null

  const variantDigit = Number(codeKey.at(-1))
  const index =
    Number.isInteger(variantDigit) && variantDigit >= 1 && variantDigit <= bloodEntries.length
      ? variantDigit - 1
      : 0

  return normalizeAssetSlug(bloodEntries[index]?.[1] ?? bloodEntries[0][1])
}

export function resolveItemSlugFromCode(
  itemCode: number | string | null | undefined,
): string | null {
  if (itemCode === null || itemCode === undefined) return null
  const code = typeof itemCode === 'number' ? itemCode : Number(itemCode)
  if (!Number.isFinite(code) || !Number.isInteger(code) || code <= 0) return null

  const slug = ITEM_CODE_TO_SLUG[code] ?? resolveBloodEnchantVariantSlug(code)
  if (!slug) return null
  return normalizeAssetSlug(slug)
}

export function resolveVerifiedItemSlug(slug: string | null | undefined): string | null {
  const normalized = normalizeAssetSlug(slug)
  if (!normalized || !VERIFIED_ITEM_SLUGS.has(normalized)) return null
  return normalized
}

/** 슬롯1 — 무기 종류 아이콘 (weapon-group) */
export function resolveVerifiedWeaponTypeSlug(slug: string | null | undefined): string | null {
  const normalized = normalizeAssetSlug(slug)
  if (!normalized) return null
  const full = normalized.startsWith('weapons/weapon-group/')
    ? normalized
    : `weapons/weapon-group/${normalized}`
  if (!VERIFIED_ITEM_SLUGS.has(full)) return null
  return full
}

export function resolveVerifiedGearItemSlug(slug: string | null | undefined): string | null {
  const normalized = normalizeAssetSlug(slug)
  if (!normalized) return null
  if (!VERIFIED_ITEM_SLUGS.has(normalized)) return null
  if (normalized.startsWith('weapons/weapon-group/')) return null
  return normalized
}
