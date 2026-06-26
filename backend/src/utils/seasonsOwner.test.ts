import { describe, expect, it } from 'vitest'

import { withSeasonsOwnerMetadata } from '../utils/seasonsOwner.js'

describe('withSeasonsOwnerMetadata', () => {
  it('attaches owner, requestedRange, and partial status for current-only chunk', () => {
    const result = withSeasonsOwnerMetadata(
      { currentSeason: 11, seasons: [] },
      { nickname: 'bob', userNum: 12345 },
      11,
      11,
      11,
    )

    expect(result.owner?.nickname).toBe('bob')
    expect(result.owner?.userNum).toBe(12345)
    expect(result.requestedRange).toEqual({ from: 11, to: 11 })
    expect(result.status).toBe('partial')
  })

  it('marks full range responses as complete', () => {
    const result = withSeasonsOwnerMetadata(
      { currentSeason: 11, seasons: [] },
      { nickname: 'bob', userNum: 12345 },
      1,
      11,
      11,
    )

    expect(result.status).toBe('complete')
  })
})
