import { describe, expect, it } from 'vitest'

import { formatRefreshTimeLabel, parseRefreshTimestamp } from '@/utils/refreshTimeLabel'

const now = new Date('2026-06-18T12:00:00.000Z')

describe('formatRefreshTimeLabel', () => {
  it('방금 갱신', () => {
    expect(formatRefreshTimeLabel(new Date('2026-06-18T11:59:30.000Z'), now)).toBe('방금 갱신')
  })

  it('5분 전 갱신', () => {
    expect(formatRefreshTimeLabel(new Date('2026-06-18T11:55:00.000Z'), now)).toBe('5분 전 갱신')
  })

  it('1시간 전 갱신', () => {
    expect(formatRefreshTimeLabel(new Date('2026-06-18T11:00:00.000Z'), now)).toBe('1시간 전 갱신')
  })

  it('1일 전 갱신', () => {
    expect(formatRefreshTimeLabel(new Date('2026-06-17T12:00:00.000Z'), now)).toBe('1일 전 갱신')
  })

  it('같은 해 날짜 라벨', () => {
    expect(formatRefreshTimeLabel(new Date('2026-04-28T08:00:00.000Z'), now)).toBe('4월 28일 갱신')
  })

  it('다른 해 날짜 라벨', () => {
    expect(formatRefreshTimeLabel(new Date('2025-04-28T08:00:00.000Z'), now)).toBe(
      '2025년 4월 28일 갱신',
    )
  })

  it('null/invalid', () => {
    expect(parseRefreshTimestamp(null)).toBeNull()
    expect(parseRefreshTimestamp('invalid')).toBeNull()
    expect(formatRefreshTimeLabel(new Date(Number.NaN), now)).toBe('갱신 기록 없음')
  })
})
