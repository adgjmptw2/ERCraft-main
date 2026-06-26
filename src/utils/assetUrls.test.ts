import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  characterPortraitUrl,
  characterPortraitUrlCandidates,
  characterSkinPortraitUrl,
  getAssetBaseUrl,
  itemIconUrlByCode,
  itemIconUrlFromSlug,
  loadoutIconUrlFromSlug,
  normalizeAssetSlug,
  tierBadgeUrl,
  tierSlugFromLabel,
  traitIconUrlFromSlug,
  weaponIconUrl,
  weaponIconUrlFromSlug,
} from '@/utils/assetUrls'

describe('assetUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('VITE_ASSET_BASE_URL 비어 있으면 같은 도메인 경로', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(getAssetBaseUrl()).toBe('')
    expect(characterPortraitUrl(19, undefined)).toBe('/assets/characters/19.webp')
  })

  it('VITE_ASSET_BASE_URL trailing slash 제거', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', 'https://assets.ercraft.example/')
    expect(getAssetBaseUrl()).toBe('https://assets.ercraft.example')
    expect(characterPortraitUrl(19, undefined)).toBe(
      'https://assets.ercraft.example/assets/characters/19.webp',
    )
  })

  it('characterPortraitUrl — BSER 15 시셀라는 출시순 14번 에셋', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(characterPortraitUrl(15, undefined)).toBe('/assets/characters/14.webp')
  })

  it('characterPortraitUrlCandidates — 폴더형 캐릭터 fallback 경로 포함', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(characterPortraitUrlCandidates(49, undefined)).toEqual([
      '/assets/characters/49.webp',
      '/assets/characters/49/mini-0.webp',
      '/assets/characters/49/half-0.webp',
      '/assets/characters/49/full-0.webp',
      '/assets/characters/49/mini-1.webp',
      '/assets/characters/49/half-1.webp',
      '/assets/characters/49/skills/q.webp',
    ])
  })

  it('characterNum이 null/undefined/NaN/빈문자면 null', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(characterPortraitUrl(null)).toBeNull()
    expect(characterPortraitUrl(undefined)).toBeNull()
    expect(characterPortraitUrl(Number.NaN)).toBeNull()
    expect(characterPortraitUrl(0)).toBeNull()
    expect(characterPortraitUrl(-1)).toBeNull()
    expect(characterPortraitUrl('')).toBeNull()
    expect(characterSkinPortraitUrl('')).toBeNull()
  })

  it('itemIconUrlFromSlug — 정상 slug URL', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(itemIconUrlFromSlug('material/battery')).toBe('/assets/items/material/battery.webp')
    expect(loadoutIconUrlFromSlug('chaos/stopping-power')).toBe(
      '/assets/loadout/chaos/stopping-power.webp',
    )
    expect(traitIconUrlFromSlug('havoc/frenzy')).toBe('/assets/loadout/havoc/frenzy.webp')
    expect(weaponIconUrlFromSlug('arcana/glass-bead')).toBe(
      '/assets/items/weapons/arcana/glass-bead.webp',
    )
  })

  it('slug 헬퍼 — 빈 값·위험 경로는 null', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(normalizeAssetSlug(null)).toBeNull()
    expect(normalizeAssetSlug(undefined)).toBeNull()
    expect(normalizeAssetSlug('')).toBeNull()
    expect(normalizeAssetSlug('   ')).toBeNull()
    expect(normalizeAssetSlug('NaN')).toBeNull()
    expect(normalizeAssetSlug('../secret')).toBeNull()
    expect(normalizeAssetSlug('/absolute/path')).toBeNull()
    expect(normalizeAssetSlug('https://evil.example/x')).toBeNull()
    expect(itemIconUrlFromSlug('../x')).toBeNull()
    expect(loadoutIconUrlFromSlug('')).toBeNull()
  })

  it('itemIconUrlByCode — 매핑 없으면 null, 검증된 코드는 URL', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(itemIconUrlByCode(113408)).toBe('/assets/items/weapons/shuriken/frost-venom-dart.webp')
    expect(itemIconUrlByCode(101701)).toBe('/assets/items/weapons/dagger/scarlet-dagger.webp')
    expect(itemIconUrlByCode(1)).toBeNull()
    expect(weaponIconUrl(6)).toBeNull()
    expect(itemIconUrlByCode(null)).toBeNull()
    expect(weaponIconUrl('abc')).toBeNull()
  })

  it('tierSlugFromLabel 한·영 티어 헤드 매핑', () => {
    expect(tierSlugFromLabel('Gold IV')).toBe('gold')
    expect(tierSlugFromLabel('골드 IV')).toBe('gold')
    expect(tierSlugFromLabel('미스릴')).toBe('mithril')
    expect(tierSlugFromLabel('데미갓')).toBe('titan')
    expect(tierSlugFromLabel('데미')).toBe('titan')
    expect(tierSlugFromLabel('이터니티')).toBe('immortal')
    expect(tierSlugFromLabel('이터')).toBe('immortal')
    expect(tierSlugFromLabel('')).toBeNull()
    expect(tierSlugFromLabel(null)).toBeNull()
  })

  it('tierBadgeUrl은 매핑 가능한 티어만 경로 반환', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '')
    expect(tierBadgeUrl('Platinum II')).toBe('/assets/tiers/platinum.webp')
    expect(tierBadgeUrl('플래티넘 II')).toBe('/assets/tiers/platinum.webp')
    expect(tierBadgeUrl('데미갓')).toBe('/assets/tiers/titan.webp')
    expect(tierBadgeUrl('데미')).toBe('/assets/tiers/titan.webp')
    expect(tierBadgeUrl('이터니티')).toBe('/assets/tiers/immortal.webp')
    expect(tierBadgeUrl('이터')).toBe('/assets/tiers/immortal.webp')
    expect(tierBadgeUrl('   ')).toBeNull()
  })
})
