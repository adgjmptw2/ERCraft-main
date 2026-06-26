import { describe, expect, it } from 'vitest'

import assetOverridesJson from '@/data/cobaltInfusionAssetOverrides.json'
import {
  BOUGHT_INFUSION_META_CODES,
  type CobaltInfusionAssetOverride,
  cobaltInfusionDisplayLabel,
  cobaltInfusionIconUrl,
  isBoughtInfusionMetaKey,
  isFinalInfusionDisplayCode,
  parseCobaltInfusionCode,
  resolveCobaltInfusion,
} from '@/utils/cobaltInfusions'
import catalog from '@/data/cobaltInfusions.generated.json'
import manifest from '@/assets/manifest.json'

const MANIFEST_INFUSION_SLUGS = new Set(
  (manifest.loadout ?? []).filter((slug) => slug.startsWith('infusion-cobalt-protocol/')),
)

describe('cobaltInfusions', () => {
  it('finalInfusion=13은 공식 InfusionProduct+l10n으로 Cooldown Reduction', () => {
    const resolved = resolveCobaltInfusion(13)

    expect(resolved).toMatchObject({
      code: 13,
      nameKo: '쿨다운 감소',
      nameEn: 'Cooldown Reduction',
      isKnown: true,
      verified: true,
    })
    expect(resolved?.nameKo).not.toContain('Overwatch')
    expect(cobaltInfusionDisplayLabel(13)).toBe('쿨다운 감소')

    const iconUrl = cobaltInfusionIconUrl(13)
    if (iconUrl) {
      expect(iconUrl).toContain('cooldown-reduction')
      expect(iconUrl).not.toContain('overwatch')
      expect(iconUrl).not.toContain('/013')
    }
  })

  it('finalInfusion="13" 문자열도 동일하게 처리', () => {
    expect(resolveCobaltInfusion('13')).toMatchObject({
      code: 13,
      nameKo: '쿨다운 감소',
      isKnown: true,
      verified: true,
    })
  })

  it('trait-style finalInfusion 7000501은 쿨다운 감소(apiCode 13)로 해석', () => {
    expect(resolveCobaltInfusion(7000501)).toMatchObject({
      code: 13,
      nameKo: '쿨다운 감소',
      isKnown: true,
      verified: true,
    })
  })

  it('productCode 7920202는 광견병(apiCode 32)로 해석', () => {
    expect(resolveCobaltInfusion(7920202)).toMatchObject({
      code: 32,
      nameKo: '광견병',
      isKnown: true,
      verified: true,
    })
  })

  it('productCode 7922602·7922402는 견고·수확 Mk2 (traitSecondSub 장착 코드)', () => {
    expect(resolveCobaltInfusion(7922602)).toMatchObject({
      code: 76,
      nameKo: '견고',
      isKnown: true,
    })
    expect(resolveCobaltInfusion(7922402)).toMatchObject({
      code: 74,
      nameKo: '수확 Mk2',
      isKnown: true,
    })
    expect(cobaltInfusionIconUrl(7922602)).toContain('steadfast')
    expect(cobaltInfusionIconUrl(7922402)).toContain('spirit-culling')
  })

  it('미등록 traitSecondSub productCode는 표시하지 않음', () => {
    expect(resolveCobaltInfusion(7923602)).toBeNull()
    expect(resolveCobaltInfusion(7923903)).toBeNull()
    expect(resolveCobaltInfusion(7910301)).toBeNull()
  })

  it('finalInfusion apiCode 64는 디스코 (구매 슬롯 코드)', () => {
    const resolved = resolveCobaltInfusion(63)

    expect(resolved).toMatchObject({
      code: 63,
      nameKo: '디스코',
      nameEn: 'Party Rocker',
      isKnown: true,
      verified: true,
    })
    const iconUrl = cobaltInfusionIconUrl(63)
    if (iconUrl) {
      expect(iconUrl).toContain('party-rocker')
    }
  })

  it('수확 Mk2(apiCode 74)와 견고(apiCode 76) 아이콘 slug', () => {
    expect(resolveCobaltInfusion(74)).toMatchObject({
      code: 74,
      nameKo: '수확 Mk2',
      isKnown: true,
    })
    expect(cobaltInfusionIconUrl(74)).toContain('spirit-culling')

    expect(resolveCobaltInfusion(76)).toMatchObject({
      code: 76,
      nameKo: '견고',
      isKnown: true,
    })
    expect(cobaltInfusionIconUrl(76)).toContain('steadfast')
  })

  it('finalInfusion=19는 방해 효과 저항 + unwavering-mentality 아이콘', () => {
    const resolved = resolveCobaltInfusion(19)
    expect(resolved).toMatchObject({
      code: 19,
      nameKo: '방해 효과 저항',
      isKnown: true,
      verified: true,
    })
    const iconUrl = cobaltInfusionIconUrl(19)
    if (iconUrl) {
      expect(iconUrl).toContain('unwavering-mentality')
    }
  })

  it('finalInfusion=10000은 A.M.D.S + a-m-d-s 아이콘', () => {
    const resolved = resolveCobaltInfusion(10000)
    expect(resolved).toMatchObject({
      code: 10000,
      nameKo: 'A.M.D.S',
      isKnown: true,
      verified: true,
    })
    const iconUrl = cobaltInfusionIconUrl(10000)
    if (iconUrl) {
      expect(iconUrl).toContain('a-m-d-s')
    }
  })

  it('finalInfusion=69는 지진파 + earthquake 아이콘', () => {
    const resolved = resolveCobaltInfusion(69)
    expect(resolved).toMatchObject({
      code: 69,
      nameKo: '지진파',
      isKnown: true,
      verified: true,
    })
    const iconUrl = cobaltInfusionIconUrl(69)
    if (iconUrl) {
      expect(iconUrl).toContain('earthquake')
    }
  })

  it('code 27은 공식 이름이 없으면 안전 fallback', () => {
    expect(resolveCobaltInfusion(27)).toMatchObject({
      code: 27,
      nameKo: '인퓨전 27',
      assetPath: null,
      isKnown: false,
      verified: false,
    })
  })

  it('code 79는 Special l10n이 있으면 공식 이름 사용', () => {
    const entry = catalog.catalog.find((row) => row.apiCode === 79)
    const resolved = resolveCobaltInfusion(79)
    if (entry?.nameVerified) {
      expect(resolved).toMatchObject({
        code: 79,
        nameKo: '수상한 실험',
        nameEn: 'Suspicious Experiment',
        isKnown: true,
        verified: true,
      })
    } else {
      expect(resolved).toMatchObject({
        code: 79,
        nameKo: '인퓨전 79',
        isKnown: false,
      })
    }
  })

  it('code 0은 parse에서 제외', () => {
    expect(parseCobaltInfusionCode(0)).toBeNull()
    expect(resolveCobaltInfusion(0)).toBeNull()
  })

  it('boughtInfusion meta key는 final infusion resolver에서 제외', () => {
    for (const code of BOUGHT_INFUSION_META_CODES) {
      expect(isBoughtInfusionMetaKey(code)).toBe(true)
      expect(parseCobaltInfusionCode(code)).toBeNull()
      expect(resolveCobaltInfusion(code)).toBeNull()
      expect(isFinalInfusionDisplayCode(code)).toBe(false)
    }
  })

  it('미등록 code는 fallback 유지', () => {
    expect(resolveCobaltInfusion(99999)).toMatchObject({
      code: 99999,
      nameKo: '인퓨전 99999',
      isKnown: false,
      verified: false,
    })
  })

  it('null/undefined는 null 반환', () => {
    expect(resolveCobaltInfusion(null)).toBeNull()
    expect(resolveCobaltInfusion(undefined)).toBeNull()
    expect(cobaltInfusionDisplayLabel(null)).toBe('인퓨전')
    expect(cobaltInfusionIconUrl(undefined)).toBeNull()
  })
})

describe('cobaltInfusions.generated catalog', () => {
  it('apiCode 중복 없음, 필수 필드 유지', () => {
    const codes = catalog.catalog.map((entry) => entry.apiCode)
    expect(new Set(codes).size).toBe(codes.length)
    for (let i = 1; i < codes.length; i += 1) {
      expect(codes[i]).toBeGreaterThan(codes[i - 1])
    }
    for (const entry of catalog.catalog) {
      expect(entry).toMatchObject({
        apiCode: expect.any(Number),
        sourceMetaType: 'InfusionProduct',
        nameVerified: expect.any(Boolean),
        assetVerified: expect.any(Boolean),
      })
      if (entry.nameVerified) {
        expect(entry.koName || entry.enName).toBeTruthy()
      }
      if (entry.assetVerified) {
        expect(entry.assetSlug).toBeTruthy()
      }
    }
  })

  it('code 13은 013 prefix 아이콘과 연결되지 않음', () => {
    const entry = catalog.catalog.find((row) => row.apiCode === 13)
    expect(entry?.assetSlug).toBe('infusion-cobalt-protocol/cooldown-reduction')
    expect(entry?.assetSlug).not.toContain('overwatch')
  })

  it('Party Rocker 계열은 manifest slug에 연결', () => {
    const partyRocker = catalog.catalog.filter(
      (row) => row.groupEnName === 'Party Rocker' || row.enName === 'Party Rocker',
    )
    for (const row of partyRocker) {
      expect(row.assetSlug).toBe('infusion-cobalt-protocol/party-rocker')
    }
  })
})

describe('cobaltInfusionAssetOverrides', () => {
  it('override는 manifest asset만 참조하고 evidence가 있어야 함', () => {
    const assetOverrides = assetOverridesJson as CobaltInfusionAssetOverride[]
    const seen = new Set<number>()
    for (const row of assetOverrides) {
      expect(seen.has(row.apiCode)).toBe(false)
      seen.add(row.apiCode)
      expect(row.evidence.trim().length).toBeGreaterThan(0)
      expect(MANIFEST_INFUSION_SLUGS.has(row.assetSlug)).toBe(true)

      const catalogEntry = catalog.catalog.find((entry) => entry.apiCode === row.apiCode)
      if (catalogEntry?.koName) {
        expect(catalogEntry.koName).toBeTruthy()
      }
    }
  })
})

describe.skipIf(!process.env.FANKIT_PATH?.trim())('fankit cobalt infusion import sources', () => {
  it('steadfast/thorn-shackles는 Cobalt Protocol 폴더 PNG를 사용', async () => {
    const { buildFankitAssetIndex, resolveFankitSource } = await import('@/utils/fankitItemIndexLoader').then((mod) => mod.loadFankitItemIndex())
    const index = await buildFankitAssetIndex(process.env.FANKIT_PATH!.trim())
    const steadfast = resolveFankitSource('infusion-cobalt-protocol/steadfast', index)
    expect(steadfast).toContain('06. Infusion_Cobalt Protocol')
    expect(steadfast).toContain('012. Steadfast.png')

    const thorns = resolveFankitSource('infusion-cobalt-protocol/thorn-shackles', index)
    expect(thorns).toContain('06. Infusion_Cobalt Protocol')
    expect(thorns).toContain('013. Thorn Shackles.png')
  })
})
