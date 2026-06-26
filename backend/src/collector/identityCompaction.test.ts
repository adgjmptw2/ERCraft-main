import { describe, expect, it, vi } from 'vitest'

import { loadCollectorConfig } from './config.js'
import { compactIdentityQueue } from './identityCompaction.js'

describe('identityCompaction', () => {
  it('dry-run scans without writes', async () => {
    const prisma = {
      collectorIdentityQueue: {
        findMany: vi.fn(async () => []),
      },
    } as unknown as import('@prisma/client').PrismaClient
    const result = await compactIdentityQueue(prisma, loadCollectorConfig({ workerId: 'test' }), {
      dryRun: true,
    })
    expect(result.scanned).toBe(0)
  })
})
