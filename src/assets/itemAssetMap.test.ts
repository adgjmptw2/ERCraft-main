import { describe, expect, it } from 'vitest'

import {
  resolveItemSlugFromCode,
  resolveVerifiedGearItemSlug,
} from '@/assets/itemAssetMap'

describe('itemAssetMap', () => {
  it('resolveItemSlugFromCode — 일반 무기 코드', () => {
    expect(resolveItemSlugFromCode(113408)).toBe('weapons/shuriken/frost-venom-dart')
  })

  it('resolveItemSlugFromCode — 혈액 인챈트 변형 코드(슬러그 없음)은 같은 무기군 혈액 아이템으로 연결', () => {
    expect(resolveItemSlugFromCode(101701)).toBe('weapons/dagger/scarlet-dagger')
    expect(resolveItemSlugFromCode(101702)).toBe('weapons/dagger/scarlet-dagger')
    expect(resolveItemSlugFromCode(113701)).toBe('weapons/shuriken/black-lotus-shuriken')
  })

  it('resolveItemSlugFromCode — 누락됐던 장비 코드는 정확한 slug로 연결', () => {
    expect(resolveItemSlugFromCode(201403)).toBe('armor/head/mithril-helm')
    expect(resolveItemSlugFromCode(204415)).toBe('armor/leg/scv-self-controlled-vehicle')
    expect(resolveItemSlugFromCode(202509)).toBe('armor/chest/beautiful-garnment')
  })

  it('resolveVerifiedGearItemSlug — 혈액 무기 slug 검증', () => {
    const slug = resolveItemSlugFromCode(101701)
    expect(resolveVerifiedGearItemSlug(slug)).toBe('weapons/dagger/scarlet-dagger')
  })
})
