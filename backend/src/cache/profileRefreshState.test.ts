import { describe, expect, it, vi } from 'vitest'

import {
  readManualProfileRefresh,
  recordManualProfileRefresh,
} from './profileRefreshState.js'

function createPrismaMock(manualRefreshedAt: Date | null = null) {
  let stored = manualRefreshedAt
  return {
    playerProfileRefreshState: {
      findUnique: async () =>
        stored ? { manualRefreshedAt: stored } : null,
      upsert: async ({ create, update }: { create: { manualRefreshedAt: Date }; update: { manualRefreshedAt: Date } }) => {
        stored = update.manualRefreshedAt ?? create.manualRefreshedAt
        return { manualRefreshedAt: stored }
      },
    },
  } as never
}

describe('profileRefreshState', () => {
  it('수동 갱신 성공 시 manualRefreshedAt 저장', async () => {
    const at = new Date('2026-06-18T12:00:00.000Z')
    vi.setSystemTime(at)
    const prisma = createPrismaMock()
    await recordManualProfileRefresh(prisma, 'uid-1', at)
    await expect(readManualProfileRefresh(prisma, 'uid-1')).resolves.toEqual(at)
    vi.useRealTimers()
  })

  it('새 match 없어도 manualRefreshedAt 갱신', async () => {
    const first = new Date('2026-06-01T08:00:00.000Z')
    const second = new Date('2026-06-18T12:00:00.000Z')
    const prisma = createPrismaMock(first)
    await recordManualProfileRefresh(prisma, 'uid-1', second)
    await expect(readManualProfileRefresh(prisma, 'uid-1')).resolves.toEqual(second)
  })

  it('migration 미적용(P2021) 시 findUnique 예외가 전파됨 — summary 500 위험', async () => {
    const prisma = {
      playerProfileRefreshState: {
        findUnique: async () => {
          const err = new Error(
            'The table `player_profile_refresh_states` does not exist in the current database.',
          ) as Error & { code: string }
          err.code = 'P2021'
          throw err
        },
        upsert: async () => ({}),
      },
    } as never

    await expect(readManualProfileRefresh(prisma, 'uid-1')).rejects.toMatchObject({
      code: 'P2021',
    })
  })
})
