/** 장비 아이콘 배경 — 전설(노랑) · 영웅(보라) · 혈액/초월(빨강) */
export type EquipmentItemGrade = 'legend' | 'epic' | 'blood'

const GRADE_LABEL_TO_UI: Readonly<Record<string, EquipmentItemGrade>> = {
  Legend: 'legend',
  Epic: 'epic',
  Mythic: 'blood',
}

/** BSER equipmentGrade 숫자 (5=전설, 4=영웅, 6=혈액) */
const EQUIPMENT_GRADE_NUM: Readonly<Record<number, EquipmentItemGrade>> = {
  5: 'legend',
  4: 'epic',
  6: 'blood',
}

export function equipmentGradeFromLabel(
  grade: string | null | undefined,
): EquipmentItemGrade | undefined {
  if (!grade) return undefined
  return GRADE_LABEL_TO_UI[grade]
}

export function equipmentGradeFromNumber(
  grade: number | null | undefined,
): EquipmentItemGrade | undefined {
  if (grade === null || grade === undefined) return undefined
  return EQUIPMENT_GRADE_NUM[grade]
}

export function equipmentGradeLabel(grade: EquipmentItemGrade | undefined): string | undefined {
  if (!grade) return undefined
  switch (grade) {
    case 'legend':
      return '전설'
    case 'epic':
      return '영웅'
    case 'blood':
      return '혈액'
    default:
      return undefined
  }
}

export function equipmentGradeBgClass(grade: EquipmentItemGrade | undefined): string | undefined {
  if (!grade) return undefined
  switch (grade) {
    case 'legend':
      return 'gear-grade-legend'
    case 'epic':
      return 'gear-grade-epic'
    case 'blood':
      return 'gear-grade-blood'
    default:
      return undefined
  }
}
