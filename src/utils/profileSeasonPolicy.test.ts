import { describe, expect, it } from 'vitest'

import {
  isCurrentSeasonView,
  isPastSeasonNumber,
  isSeasonChipSelectable,
  profileIdentityKey,
  summaryMatchesRouteNickname,
} from '@/utils/profileSeasonPolicy'

describe('profileSeasonPolicy', () => {
  it('isCurrentSeasonView — 현재 시즌만 true', () => {
    expect(isCurrentSeasonView(11, 11)).toBe(true)
    expect(isCurrentSeasonView(10, 11)).toBe(false)
  })

  it('isPastSeasonNumber — current 미만만 past', () => {
    expect(isPastSeasonNumber(10, 11)).toBe(true)
    expect(isPastSeasonNumber(11, 11)).toBe(false)
    expect(isPastSeasonNumber(12, 11)).toBe(false)
  })

  it('isSeasonChipSelectable — real past season disabled', () => {
    expect(isSeasonChipSelectable(10, 11, true)).toBe(false)
    expect(isSeasonChipSelectable(11, 11, true)).toBe(true)
    expect(isSeasonChipSelectable(10, 11, false)).toBe(true)
  })

  it('profileIdentityKey', () => {
    expect(profileIdentityKey('절단마술사', 123)).toBe('절단마술사:123')
  })

  it('summaryMatchesRouteNickname — 대소문자 무시', () => {
    expect(summaryMatchesRouteNickname({ nickname: 'Test' }, 'test')).toBe(true)
    expect(summaryMatchesRouteNickname({ nickname: 'A' }, 'B')).toBe(false)
  })
})
