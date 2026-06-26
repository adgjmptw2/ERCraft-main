import { describe, expect, it } from 'vitest'

import {
  isNumericCharacterName,
  isUsefulCharacterName,
  resolveCharacterDisplayName,
} from './characterDisplayName.js'

describe('resolveCharacterDisplayName', () => {
  it('characterName null + characterNum 19 → 엠마', () => {
    expect(resolveCharacterDisplayName(19, null)).toBe('엠마')
  })

  it('characterName "19" → 정적 map으로 엠마', () => {
    expect(resolveCharacterDisplayName(19, '19')).toBe('엠마')
  })

  it('map에 없으면 "실험체 N"', () => {
    expect(resolveCharacterDisplayName(99999, null)).toBe('실험체 99999')
  })

  it('characterNum 없으면 알 수 없음', () => {
    expect(resolveCharacterDisplayName(null, null)).toBe('알 수 없음')
  })

  it('유효한 characterName + map에 없는 num → API name', () => {
    expect(resolveCharacterDisplayName(99999, 'Emma')).toBe('Emma')
  })
})

describe('isNumericCharacterName', () => {
  it('"19" → true', () => {
    expect(isNumericCharacterName('19')).toBe(true)
  })

  it('"엠마" → false', () => {
    expect(isNumericCharacterName('엠마')).toBe(false)
  })
})

describe('isUsefulCharacterName', () => {
  it('숫자 문자열은 false', () => {
    expect(isUsefulCharacterName(19, '19')).toBe(false)
  })

  it('한국어 이름은 true', () => {
    expect(isUsefulCharacterName(19, '엠마')).toBe(true)
  })
})
