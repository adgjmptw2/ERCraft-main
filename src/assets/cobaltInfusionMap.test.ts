import { describe, expect, it } from 'vitest'

import {
  cobaltInfusionCodeToLabel,
  cobaltInfusionIconUrl,
  resolveCobaltInfusion,
  resolveVerifiedCobaltInfusionSlug,
} from '@/assets/cobaltInfusionMap'

describe('cobaltInfusionMap', () => {
  it('finalInfusion=13은 Cooldown Reduction으로 표시', () => {
    expect(resolveCobaltInfusion(13)).toMatchObject({
      code: 13,
      nameKo: '쿨다운 감소',
      isKnown: true,
      verified: true,
    })
    expect(cobaltInfusionCodeToLabel(13)).toBe('쿨다운 감소')
    expect(resolveVerifiedCobaltInfusionSlug(13)).toBe('infusion-cobalt-protocol/cooldown-reduction')

    const iconUrl = cobaltInfusionIconUrl(13)
    if (iconUrl) {
      expect(iconUrl).toContain('cooldown-reduction')
      expect(iconUrl).not.toContain('overwatch')
    }
  })

  it('공식 데이터로 확인된 code 63은 디스코 + party-rocker slug', () => {
    expect(resolveVerifiedCobaltInfusionSlug(63)).toBe('infusion-cobalt-protocol/party-rocker')
    expect(cobaltInfusionCodeToLabel(63)).toBe('디스코')
  })

  it('미등록 code는 안전 라벨 fallback', () => {
    expect(resolveVerifiedCobaltInfusionSlug(99999)).toBeNull()
    expect(cobaltInfusionCodeToLabel(99999)).toBe('인퓨전 99999')
  })

  it('manifest slug가 있으면 icon URL 후보를 만든다', () => {
    const iconUrl = cobaltInfusionIconUrl(63)
    if (iconUrl) {
      expect(iconUrl).toContain('party-rocker')
    }
    expect(cobaltInfusionIconUrl(99999)).toBeNull()
  })
})
