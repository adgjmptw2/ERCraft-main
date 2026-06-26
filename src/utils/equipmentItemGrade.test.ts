import { describe, expect, it } from 'vitest'

import { equipmentGradeBgClass, equipmentGradeLabel } from '@/utils/equipmentItemGrade'

describe('equipmentGradeBgClass', () => {
  it('전설·영웅·혈액 등급별 배경 클래스', () => {
    expect(equipmentGradeBgClass('legend')).toBe('gear-grade-legend')
    expect(equipmentGradeBgClass('epic')).toBe('gear-grade-epic')
    expect(equipmentGradeBgClass('blood')).toBe('gear-grade-blood')
  })

  it('등급 없으면 undefined', () => {
    expect(equipmentGradeBgClass(undefined)).toBeUndefined()
  })
})

describe('equipmentGradeLabel', () => {
  it('한글 등급 라벨', () => {
    expect(equipmentGradeLabel('legend')).toBe('전설')
    expect(equipmentGradeLabel('epic')).toBe('영웅')
    expect(equipmentGradeLabel('blood')).toBe('혈액')
  })
})
