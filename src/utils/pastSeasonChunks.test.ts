import { describe, expect, it } from 'vitest'

import { buildPastSeasonChunks } from '@/utils/pastSeasonChunks'

describe('buildPastSeasonChunks', () => {
  it('현재 시즌 11 — 첫 청크 9~10, current 제외', () => {
    const chunks = buildPastSeasonChunks(11)
    expect(chunks[0]).toEqual({ from: 9, to: 10 })
    expect(chunks.every((c) => c.to < 11)).toBe(true)
  })

  it('2~3시즌 단위로 분할', () => {
    const chunks = buildPastSeasonChunks(11)
    expect(chunks).toEqual([
      { from: 9, to: 10 },
      { from: 6, to: 8 },
      { from: 3, to: 5 },
      { from: 1, to: 2 },
    ])
  })

  it('current season 1이면 빈 배열', () => {
    expect(buildPastSeasonChunks(1)).toEqual([])
  })
})
