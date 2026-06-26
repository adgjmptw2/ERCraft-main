import { describe, expect, it } from 'vitest'

import {
  buildSupportComboKey,
  isHealerSupportCombo,
  resolveSupportSubtype,
} from './supportSubtype.js'

describe('supportSubtype', () => {
  it('요한 아르카나 41:24는 healer', () => {
    expect(buildSupportComboKey(41, 24)).toBe('41:24')
    expect(isHealerSupportCombo(41, 24)).toBe(true)
    expect(resolveSupportSubtype(41, 24, '서포터')).toBe('healer')
  })

  it('샬럿 아르카나 73:24는 healer', () => {
    expect(isHealerSupportCombo(73, 24)).toBe(true)
    expect(resolveSupportSubtype(73, 24, '서포터')).toBe('healer')
  })

  it('레니 권총 69:9는 utility', () => {
    expect(resolveSupportSubtype(69, 9, '서포터')).toBe('utility')
  })

  it('프리야 기타 51:22는 utility', () => {
    expect(resolveSupportSubtype(51, 22, '서포터')).toBe('utility')
  })

  it('아르다 아르카나 66:24는 utility', () => {
    expect(resolveSupportSubtype(66, 24, '서포터')).toBe('utility')
  })

  it('테오도르 저격총 62:11은 utility', () => {
    expect(resolveSupportSubtype(62, 11, '서포터')).toBe('utility')
  })

  it('비서포터는 supportSubtype null', () => {
    expect(resolveSupportSubtype(73, 24, '탱커')).toBeNull()
    expect(resolveSupportSubtype(69, 9, '평타 딜러')).toBeNull()
  })

  it('numeric key로만 판정', () => {
    expect(resolveSupportSubtype(73, 9, '서포터')).toBe('utility')
    expect(resolveSupportSubtype(41, 9, '서포터')).toBe('utility')
  })
})
