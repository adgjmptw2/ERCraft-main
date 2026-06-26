import { describe, expect, it } from 'vitest'

import { finishCollectorIdentity } from './identityQueue.js'

describe('finishCollectorIdentity', () => {
  it('skips already resolved rows without throwing', async () => {
    const prisma = {
      collectorIdentityQueue: {
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => ({
          id: 1n,
          status: 'resolved',
        }),
      },
    }
    const result = await finishCollectorIdentity(
      prisma as never,
      { id: 1n } as never,
      'resolved',
    )
    expect(result).toBe('skipped-already-finished')
  })
})
