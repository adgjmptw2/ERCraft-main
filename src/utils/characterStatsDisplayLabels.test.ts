import { describe, expect, it } from 'vitest'

import { RANK_AGGREGATE_STATS_LABEL } from '@/analysis/realProfileReport'

describe('character stats display labels', () => {
  it('player-match source UI label', () => {
    expect(RANK_AGGREGATE_STATS_LABEL).toBe('랭크 집계 기준')
  })
})
