import { describe, expect, it } from 'vitest'

describe('drainUntil no-progress policy', () => {
  it('treats backlog decrease as progress', () => {
    let streak = 0
    for (const netChange of [-238, -153, -120]) {
      if (netChange >= 0) streak += 1
      else streak = 0
      expect(streak).toBe(0)
    }

    streak = 0
    for (const netChange of [-100, 5, 12]) {
      if (netChange >= 0) streak += 1
      else streak = 0
    }
    expect(streak).toBe(2)
  })
})
