import { describe, expect, it } from 'vitest'

import { isIconPublicRelativePath } from './iconAssetPaths.mjs'
import {
  DEFAULT_ICON_CONTENT_SCALE,
  DEFAULT_ICON_TARGET_SIZE,
  computePaddedIconSizes,
} from './iconWebpPaddingCore.mjs'

describe('computePaddedIconSizes', () => {
  it('targetSize·contentScale 기준 safeSize·padPx 계산', () => {
    const result = computePaddedIconSizes(64, 0.82)
    expect(result.targetSize).toBe(64)
    expect(result.contentScale).toBe(0.82)
    expect(result.safeSize).toBe(52)
    expect(result.padPx).toBe(6)
    expect(result.marginPercentPerSide).toBeCloseTo(9.375, 2)
  })

  it('기본 아이콘 사이즈 64·scale 0.82 — 콘텐츠가 캔버스의 약 82% 이내', () => {
    const { safeSize, targetSize } = computePaddedIconSizes(
      DEFAULT_ICON_TARGET_SIZE,
      DEFAULT_ICON_CONTENT_SCALE,
    )
    expect(safeSize / targetSize).toBeCloseTo(0.8125, 2)
  })

  it('잘못된 targetSize는 예외', () => {
    expect(() => computePaddedIconSizes(0, 0.82)).toThrow()
    expect(() => computePaddedIconSizes(-1, 0.82)).toThrow()
  })

  it('잘못된 contentScale은 예외', () => {
    expect(() => computePaddedIconSizes(64, 0)).toThrow()
    expect(() => computePaddedIconSizes(64, 1.2)).toThrow()
  })
})

describe('isIconPublicRelativePath', () => {
  it('items·loadout만 허용', () => {
    expect(isIconPublicRelativePath('items/weapons/arcana/glass-bead.webp')).toBe(true)
    expect(isIconPublicRelativePath('loadout/havoc/vampiric-bloodline.webp')).toBe(true)
  })

  it('characters·tiers·brand·skins 제외', () => {
    expect(isIconPublicRelativePath('characters/11.webp')).toBe(false)
    expect(isIconPublicRelativePath('tiers/diamond.webp')).toBe(false)
    expect(isIconPublicRelativePath('brand/logo.webp')).toBe(false)
    expect(isIconPublicRelativePath('skins/1001001.webp')).toBe(false)
  })
})
