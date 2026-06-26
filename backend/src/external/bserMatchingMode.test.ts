import { describe, expect, it } from 'vitest'

import {
  BSER_MATCHING_MODE_COBALT,
  BSER_MATCHING_MODE_NORMAL,
  BSER_MATCHING_MODE_RANKED,
  UNION_MATCHING_MODE_SUPPORTED,
  mapBserMatchingModeToGameMode,
  resolveStoredMatchGameMode,
} from './bserMatchingMode.js'

describe('mapBserMatchingModeToGameMode', () => {
  it('matchingMode 3 → rank', () => {
    expect(mapBserMatchingModeToGameMode(BSER_MATCHING_MODE_RANKED)).toBe('rank')
  })

  it('matchingMode 6 → cobalt', () => {
    expect(mapBserMatchingModeToGameMode(BSER_MATCHING_MODE_COBALT)).toBe('cobalt')
  })

  it('matchingMode 2 → normal', () => {
    expect(mapBserMatchingModeToGameMode(BSER_MATCHING_MODE_NORMAL)).toBe('normal')
  })

  it('미확인 matchingMode는 normal fallback (union 코드 추측 금지)', () => {
    expect(mapBserMatchingModeToGameMode(7)).toBe('normal')
    expect(mapBserMatchingModeToGameMode(99)).toBe('normal')
  })

  it('union API mapping은 공식 확인 전 unsupported', () => {
    expect(UNION_MATCHING_MODE_SUPPORTED).toBe(false)
  })
})

describe('resolveStoredMatchGameMode', () => {
  it('matchingMode 6이면 저장 gameMode가 normal이어도 cobalt', () => {
    expect(
      resolveStoredMatchGameMode({
        gameMode: 'normal',
        matchingMode: BSER_MATCHING_MODE_COBALT,
      }),
    ).toBe('cobalt')
  })

  it('cobaltInfusions가 있으면 gameMode normal이어도 cobalt', () => {
    expect(
      resolveStoredMatchGameMode({
        gameMode: 'normal',
        matchingMode: BSER_MATCHING_MODE_NORMAL,
        hasCobaltInfusions: true,
      }),
    ).toBe('cobalt')
  })

  it('matchingMode 3 + finalInfusion 흔적이 있어도 rank 유지', () => {
    expect(
      resolveStoredMatchGameMode({
        gameMode: 'normal',
        matchingMode: BSER_MATCHING_MODE_RANKED,
        hasCobaltInfusions: true,
      }),
    ).toBe('rank')
  })
})
