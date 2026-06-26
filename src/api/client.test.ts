import { describe, expect, it } from 'vitest'

function normalizeApiBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

describe('normalizeApiBaseUrl', () => {
  it('trailing slash 제거', () => {
    expect(normalizeApiBaseUrl('http://localhost:3001/')).toBe('http://localhost:3001')
  })

  it('공백 trim', () => {
    expect(normalizeApiBaseUrl(' http://localhost:3001 ')).toBe('http://localhost:3001')
  })

  it('빈 값', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('')
    expect(normalizeApiBaseUrl('   ')).toBe('')
  })
})
