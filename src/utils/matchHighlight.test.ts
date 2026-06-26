import { describe, expect, it } from 'vitest'

import {
  compareMatchGrade,
  getMatchHighlight,
  isMatchGradeAtLeast,
  normalizeMatchGrade,
  summarizeMatchHighlights,
} from '@/utils/matchHighlight'

describe('normalizeMatchGrade', () => {
  it('유효한 등급을 인식한다', () => {
    expect(normalizeMatchGrade('S+')).toBe('S+')
    expect(normalizeMatchGrade(' B ')).toBe('B')
  })

  it('없거나 알 수 없는 등급은 null', () => {
    expect(normalizeMatchGrade(undefined)).toBeNull()
    expect(normalizeMatchGrade('')).toBeNull()
    expect(normalizeMatchGrade('SSS')).toBeNull()
    expect(normalizeMatchGrade('상위 5%')).toBeNull()
  })
})

describe('isMatchGradeAtLeast', () => {
  it('S 계열 비교', () => {
    expect(isMatchGradeAtLeast('S+', 'S-')).toBe(true)
    expect(isMatchGradeAtLeast('S', 'S-')).toBe(true)
    expect(isMatchGradeAtLeast('A+', 'S-')).toBe(false)
  })
})

describe('compareMatchGrade', () => {
  it('높은 등급이 양수', () => {
    expect(compareMatchGrade('S+', 'A')).toBeGreaterThan(0)
    expect(compareMatchGrade('B', 'S')).toBeLessThan(0)
  })

  it('알 수 없는 등급은 null', () => {
    expect(compareMatchGrade('unknown', 'S')).toBeNull()
  })
})

describe('getMatchHighlight', () => {
  it('rank 1 + S+ → MVP', () => {
    const result = getMatchHighlight(1, 'S+')
    expect(result.level).toBe('mvp')
    expect(result.label).toBe('MVP')
    expect(result.description).toContain('S+')
  })

  it('rank 1 + S → 하이라이트 없음', () => {
    expect(getMatchHighlight(1, 'S').level).toBe('none')
  })

  it('rank 1 + S- → 하이라이트 없음', () => {
    expect(getMatchHighlight(1, 'S-').level).toBe('none')
  })

  it('rank 2 + S+ → 하이라이트 없음', () => {
    expect(getMatchHighlight(2, 'S+').level).toBe('none')
  })

  it('rank 1 + A → 하이라이트 없음', () => {
    expect(getMatchHighlight(1, 'A').level).toBe('none')
  })

  it('rank 1 + B → 하이라이트 없음', () => {
    expect(getMatchHighlight(1, 'B').level).toBe('none')
    expect(getMatchHighlight(3, 'B').level).toBe('none')
  })

  it('rank 없음 / grade 없음 → none', () => {
    expect(getMatchHighlight(0, 'S+').level).toBe('none')
    expect(getMatchHighlight(undefined, 'S+').level).toBe('none')
    expect(getMatchHighlight(2, undefined).level).toBe('none')
  })

  it('알 수 없는 grade → 에러 없이 none', () => {
    expect(getMatchHighlight(2, 'unknown').level).toBe('none')
  })

  it('금지 문구를 생성하지 않는다', () => {
    const result = getMatchHighlight(1, 'S+')
    const text = `${result.label} ${result.description}`
    expect(text).not.toMatch(/SSS|상위|백분위|빤짝이/i)
  })
})

describe('summarizeMatchHighlights', () => {
  it('목록 기준 MVP 판수를 계산한다', () => {
    const summary = summarizeMatchHighlights([
      { placement: 1, matchGrade: 'S+' },
      { placement: 1, matchGrade: 'S' },
      { placement: 2, matchGrade: 'S+' },
    ])
    expect(summary.matchCount).toBe(3)
    expect(summary.mvpMatches).toBe(1)
  })
})
