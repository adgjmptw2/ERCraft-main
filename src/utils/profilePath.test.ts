import { describe, expect, it } from 'vitest'

import { buildPlayerProfilePath, parsePlayerNicknameParam, parseProfileUserNumParam } from '@/utils/profilePath'

describe('profilePath', () => {
  it('buildPlayerProfilePath — 한글 인코딩', () => {
    expect(buildPlayerProfilePath('절단마술사')).toBe(
      `/player/${encodeURIComponent('절단마술사')}`,
    )
  })

  it('buildPlayerProfilePath — trim', () => {
    expect(buildPlayerProfilePath('  마인  ')).toBe(`/player/${encodeURIComponent('마인')}`)
  })

  it('parsePlayerNicknameParam — 디코딩', () => {
    const encoded = encodeURIComponent('절단마술사')
    expect(parsePlayerNicknameParam(encoded)).toBe('절단마술사')
  })

  it('buildPlayerProfilePath — userNum 옵션 없이 nickname only (39.6E)', () => {
    expect(buildPlayerProfilePath('절단마술사')).toBe(
      `/player/${encodeURIComponent('절단마술사')}`,
    )
  })

  it('parseProfileUserNumParam — 유효한 양수만', () => {
    expect(parseProfileUserNumParam('12345')).toBe(12345)
    expect(parseProfileUserNumParam('0')).toBeUndefined()
    expect(parseProfileUserNumParam('abc')).toBeUndefined()
    expect(parseProfileUserNumParam(null)).toBeUndefined()
  })

  it('프로필 route는 singular /player/:nickname', () => {
    expect(buildPlayerProfilePath('test')).toMatch(/^\/player\//)
    expect(buildPlayerProfilePath('test')).not.toMatch(/^\/players\//)
  })
})
