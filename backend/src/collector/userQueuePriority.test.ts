import { describe, expect, it } from 'vitest'

import {
  computeUserQueuePriorityFromRp,
  isLowTierRp,
  LOW_TIER_RP_MAX,
} from './userQueuePriority.js'

describe('userQueuePriority', () => {
  it('iron-silver beats gold+ priority (lower number)', () => {
    expect(computeUserQueuePriorityFromRp(300, 11)).toBeLessThan(
      computeUserQueuePriorityFromRp(3000, 11),
    )
    expect(computeUserQueuePriorityFromRp(1500, 11)).toBeLessThan(
      computeUserQueuePriorityFromRp(5000, 11),
    )
  })

  it('isLowTierRp through gold max', () => {
    expect(isLowTierRp(0)).toBe(true)
    expect(isLowTierRp(2399)).toBe(true)
    expect(isLowTierRp(LOW_TIER_RP_MAX)).toBe(true)
    expect(isLowTierRp(LOW_TIER_RP_MAX + 1)).toBe(false)
    expect(isLowTierRp(null)).toBe(false)
  })

  it('gold RP maps below platinum priority', () => {
    expect(computeUserQueuePriorityFromRp(3000, 11)).toBe(35)
    expect(computeUserQueuePriorityFromRp(3000, 11)).toBeLessThan(
      computeUserQueuePriorityFromRp(5000, 11),
    )
  })
})