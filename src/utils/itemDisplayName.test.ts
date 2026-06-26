import { describe, expect, it } from 'vitest'

import { buildGearItemInfo } from '@/utils/gearItemInfo'
import { itemDisplayNameFromSlug } from '@/utils/itemDisplayName'

describe('itemDisplayNameFromSlug', () => {
  it('slug leaf를 표시 이름으로 변환', () => {
    expect(itemDisplayNameFromSlug('weapons/shuriken/frost-venom-dart')).toBe('Frost Venom Dart')
  })
})

describe('buildGearItemInfo', () => {
  it('슬롯·이름·등급 조합', () => {
    expect(
      buildGearItemInfo('weapons/shuriken/frost-venom-dart', '무기', 'legend'),
    ).toEqual({
      slotLabel: '무기',
      itemName: 'Frost Venom Dart',
      gradeLabel: '전설',
    })
  })

  it('slug 없으면 null', () => {
    expect(buildGearItemInfo(undefined, '무기')).toBeNull()
  })
})
