import { describe, expect, it } from 'vitest'

import { resolveCharacterDisplayName, isNumericCharacterName } from '@/utils/characterMap'

describe('character name hotfix', () => {
  it('characterName "19" → 엠마', () => {
    expect(resolveCharacterDisplayName(19, '19')).toBe('엠마')
  })

  it('characterName 없음 + characterNum → 한국어명', () => {
    expect(resolveCharacterDisplayName(11, undefined)).toBe('유키')
  })

  it('map 없으면 "실험체 N"', () => {
    expect(resolveCharacterDisplayName(99999, '99999')).toBe('실험체 99999')
  })

  it('isNumericCharacterName detects digit-only', () => {
    expect(isNumericCharacterName('19')).toBe(true)
    expect(isNumericCharacterName('엠마')).toBe(false)
  })
})
