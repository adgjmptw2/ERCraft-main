import { describe, expect, it } from 'vitest'

import { resolvePlayerSearchTerm } from './schemas.js'

describe('resolvePlayerSearchTerm', () => {
  it('q 우선', () => {
    expect(resolvePlayerSearchTerm({ q: ' 절단마술사 ', nickname: 'other' })).toBe('절단마술사')
  })

  it('nickname 단독', () => {
    expect(resolvePlayerSearchTerm({ nickname: ' 마인 ' })).toBe('마인')
  })

  it('빈 값', () => {
    expect(resolvePlayerSearchTerm({})).toBe('')
    expect(resolvePlayerSearchTerm({ q: '   ' })).toBe('')
  })
})
