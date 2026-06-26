import { describe, expect, it } from 'vitest'

import { formatComboDisplayName } from './comboDisplayName.js'
import { resolveWeaponDisplayName } from './weaponDisplayName.js'
import { resolveCharacterDisplayName } from './characterDisplayName.js'

describe('comboDisplayName', () => {
  it('(8,22) → 하트 기타', () => {
    expect(formatComboDisplayName(8, 22)).toBe('하트 기타')
  })

  it('(2,10) → 아야 돌격 소총', () => {
    expect(formatComboDisplayName(2, 10)).toBe('아야 돌격 소총')
  })

  it('(60,6) → 타지아 암기', () => {
    expect(formatComboDisplayName(60, 6)).toBe('타지아 암기')
  })

  it('(26,9) → 바바라 권총', () => {
    expect(formatComboDisplayName(26, 9)).toBe('바바라 권총')
  })

  it('(10,1) → 리 다이린 글러브', () => {
    expect(formatComboDisplayName(10, 1)).toBe('리 다이린 글러브')
  })

  it('(56,20) → 피올로 쌍절곤', () => {
    expect(formatComboDisplayName(56, 20)).toBe('피올로 쌍절곤')
  })

  it('characterNum canonical mapping', () => {
    expect(resolveCharacterDisplayName(8, null)).toBe('하트')
    expect(resolveCharacterDisplayName(2, null)).toBe('아야')
  })

  it('weaponTypeId canonical mapping', () => {
    expect(resolveWeaponDisplayName(22)).toBe('기타')
    expect(resolveWeaponDisplayName(10)).toBe('돌격 소총')
    expect(resolveWeaponDisplayName(6)).toBe('암기')
  })
})
