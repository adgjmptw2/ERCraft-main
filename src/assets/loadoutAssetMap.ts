import generated from '@/assets/erCodeMaps.generated.json'
import manifest from '@/assets/manifest.json'
import { normalizeAssetSlug } from '@/utils/assetUrls'

const TACTICAL_SKILL_GROUP_TO_SLUG = generated.tacticalSkillGroupToSlug as Readonly<
  Record<string, string>
>

/** loadout(특성·큐브·전술 스킬) slug — manifest 기준 검증 목록 */
export const VERIFIED_LOADOUT_SLUGS: ReadonlySet<string> = new Set(manifest.loadout)

export const VERIFIED_TRAIT_SLUGS: ReadonlySet<string> = new Set(
  [...VERIFIED_LOADOUT_SLUGS].filter((s) => !s.startsWith('tactical-skills/')),
)

export const VERIFIED_TACTICAL_SKILL_SLUGS: ReadonlySet<string> = new Set(
  [...VERIFIED_LOADOUT_SLUGS].filter((s) => s.startsWith('tactical-skills/')),
)

export function resolveVerifiedLoadoutSlug(slug: string | null | undefined): string | null {
  const normalized = normalizeAssetSlug(slug)
  if (!normalized || !VERIFIED_LOADOUT_SLUGS.has(normalized)) return null
  return normalized
}

export function resolveVerifiedTraitSlug(slug: string | null | undefined): string | null {
  const normalized = normalizeAssetSlug(slug)
  if (!normalized || !VERIFIED_TRAIT_SLUGS.has(normalized)) return null
  return normalized
}

export function resolveVerifiedTacticalSkillSlug(slug: string | null | undefined): string | null {
  const normalized = normalizeAssetSlug(slug)
  if (!normalized) return null
  const full = normalized.startsWith('tactical-skills/')
    ? normalized
    : `tactical-skills/${normalized}`
  if (!VERIFIED_TACTICAL_SKILL_SLUGS.has(full)) return null
  return full
}

/** BSER는 31·121·500251처럼 레벨 포함 코드를 줄 때가 있어 10단위 그룹 ID로 정규화한다 */
export function normalizeTacticalSkillGroupCode(
  groupCode: number | string | null | undefined,
): number | null {
  if (groupCode === null || groupCode === undefined) return null
  const code = typeof groupCode === 'number' ? groupCode : Number(groupCode)
  if (!Number.isFinite(code) || !Number.isInteger(code) || code <= 0) return null
  if (code >= 1_000_000) return null
  return Math.floor(code / 10) * 10
}

/** 전술 스킬 그룹 코드 끝자리 — 31→1, 121→1, 30→0 */
export function extractTacticalSkillLevelFromGroupCode(
  groupCode: number | string | null | undefined,
): number | null {
  if (groupCode === null || groupCode === undefined) return null
  const code = typeof groupCode === 'number' ? groupCode : Number(groupCode)
  if (!Number.isFinite(code) || !Number.isInteger(code) || code <= 0) return null
  if (code >= 1_000_000) return null
  const level = code % 10
  return level > 0 ? level : null
}

export function resolveTacticalSkillSlugFromGroupCode(
  groupCode: number | string | null | undefined,
): string | null {
  const normalizedCode = normalizeTacticalSkillGroupCode(groupCode)
  if (normalizedCode === null) return null

  const slug = TACTICAL_SKILL_GROUP_TO_SLUG[String(normalizedCode)]
  if (!slug) return null
  return normalizeAssetSlug(slug)
}
