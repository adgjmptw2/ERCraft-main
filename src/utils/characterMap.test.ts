import { describe, expect, it } from 'vitest'

import {
  CHARACTER_KO_RELEASE_ORDER,
  resolveCharacterAssetNum,
  resolveCharacterDisplayName,
} from '@/utils/characterMap'
import { localizeCharacter } from '@/utils/gameLabels'

describe('localizeCharacter', () => {
  it('Li Dailin → 리 다일린', () => {
    expect(localizeCharacter('Li Dailin')).toBe('리 다이린')
  })

  it('LiDailin (공백 없음) → 리 다이린', () => {
    expect(localizeCharacter('LiDailin')).toBe('리 다이린')
  })

  it('매핑 없는 이름은 원문 유지', () => {
    expect(localizeCharacter('Unknown Hero')).toBe('Unknown Hero')
  })

  it('출시 실험체 86명 한국어명 중복 없음', () => {
    const released = CHARACTER_KO_RELEASE_ORDER.slice(0, 86)
    expect(new Set(released).size).toBe(86)
  })

  it('characterNum 15 → 시셀라 (출시순 인덱스와 무관)', () => {
    expect(resolveCharacterDisplayName(15, 'Chiara')).toBe('시셀라')
    expect(resolveCharacterDisplayName(15, '키아라')).toBe('시셀라')
  })

  it('characterNum 14 → 키아라', () => {
    expect(resolveCharacterDisplayName(14, 'Sissela')).toBe('키아라')
  })

  it('characterNum 63 → 이안 (Lyanh 영문명)', () => {
    expect(resolveCharacterDisplayName(63, 'Lyanh')).toBe('이안')
  })

  it('resolveCharacterAssetNum — BSER 15 시셀라 → Fankit 014', () => {
    expect(resolveCharacterAssetNum(15)).toBe(14)
    expect(resolveCharacterAssetNum(14)).toBe(15)
  })

  it('resolveCharacterAssetNum — 엠마·실비아·쇼이치 Fankit 폴더', () => {
    expect(resolveCharacterAssetNum(19)).toBe(19)
    expect(resolveCharacterAssetNum(16)).toBe(18)
    expect(resolveCharacterAssetNum(18)).toBe(17)
    expect(resolveCharacterAssetNum(13)).toBe(13)
  })

  it('resolveCharacterAssetNum — 유키는 BSER·Fankit 번호 동일', () => {
    expect(resolveCharacterAssetNum(11)).toBe(11)
  })

  it('resolveCharacterAssetNum — 초기·후반 캐릭터 Fankit 폴더', () => {
    expect(resolveCharacterAssetNum(3)).toBe(5)
    expect(resolveCharacterAssetNum(7)).toBe(3)
    expect(resolveCharacterAssetNum(49)).toBe(49)
    expect(resolveCharacterAssetNum(60)).toBe(60)
    expect(resolveCharacterAssetNum(61)).toBe(61)
    expect(resolveCharacterAssetNum(75)).toBe(75)
    expect(resolveCharacterAssetNum(76)).toBe(76)
    expect(resolveCharacterAssetNum(77)).toBe(77)
    expect(resolveCharacterAssetNum(78)).toBe(78)
    expect(resolveCharacterAssetNum(84)).toBe(84)
    expect(resolveCharacterAssetNum(85)).toBe(85)
    expect(resolveCharacterAssetNum(86)).toBe(86)
    expect(resolveCharacterAssetNum(87)).toBe(87)
    expect(resolveCharacterAssetNum(88)).toBe(88)
  })
})
