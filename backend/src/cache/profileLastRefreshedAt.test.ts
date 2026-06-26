import { describe, expect, it } from 'vitest'

import {
  hasProfileCacheData,
  hasProfileCacheDataForUids,
  resolveProfileLastRefreshedAt,
  shouldAllowAutoProfileBackfill,
} from './profileLastRefreshedAt.js'

function createPrismaMock(rows: {
  playerMatchUpdatedAt?: Date | null
  hasPlayerMatch?: boolean
  manualRefreshedAt?: Date | null
}) {
  return {
    playerMatch: {
      findMany: async () => {
        if (rows.playerMatchUpdatedAt) {
          return [{ updatedAt: rows.playerMatchUpdatedAt }]
        }
        return []
      },
      upsert: async () => ({}),
      count: async () => (rows.hasPlayerMatch ? 1 : 0),
      findFirst: async () => (rows.hasPlayerMatch ? { id: 1n } : null),
    },
    playerProfileRefreshState: {
      findUnique: async () =>
        rows.manualRefreshedAt ? { manualRefreshedAt: rows.manualRefreshedAt } : null,
      upsert: async () => ({}),
    },
  } as never
}

describe('profileLastRefreshedAt', () => {
  it('PlayerMatch updatedAt를 lastRefreshedAt로 사용', async () => {
    const at = new Date('2026-06-18T10:00:00.000Z')
    const prisma = createPrismaMock({ playerMatchUpdatedAt: at, hasPlayerMatch: true })
    const result = await resolveProfileLastRefreshedAt(prisma, 'uid-1', 39)
    expect(result?.toISOString()).toBe(at.toISOString())
  })

  it('hasProfileCacheData — PlayerMatch 없으면 false', async () => {
    const prisma = createPrismaMock({ hasPlayerMatch: false })
    await expect(hasProfileCacheData(prisma, 'uid-1')).resolves.toBe(false)
  })

  it('hasProfileCacheData — PlayerMatch 있으면 true', async () => {
    const prisma = createPrismaMock({ hasPlayerMatch: true })
    await expect(hasProfileCacheData(prisma, 'uid-1')).resolves.toBe(true)
    await expect(hasProfileCacheDataForUids(prisma, ['alias-uid'])).resolves.toBe(true)
  })
})

describe('shouldAllowAutoProfileBackfill', () => {
  it('최초 수집은 허용', () => {
    expect(
      shouldAllowAutoProfileBackfill({
        profileCached: false,
        explicitRefresh: false,
        backfillComplete: false,
      }),
    ).toBe(true)
  })

  it('완료된 캐시는 명시적 갱신 전 차단', () => {
    expect(
      shouldAllowAutoProfileBackfill({
        profileCached: true,
        explicitRefresh: false,
        backfillComplete: true,
      }),
    ).toBe(false)
  })

  it('manualRefreshedAt가 PlayerMatch updatedAt보다 우선', async () => {
    const manual = new Date('2026-06-18T12:00:00.000Z')
    const matchAt = new Date('2026-06-01T08:00:00.000Z')
    const prisma = createPrismaMock({
      manualRefreshedAt: manual,
      playerMatchUpdatedAt: matchAt,
      hasPlayerMatch: true,
    })
    const result = await resolveProfileLastRefreshedAt(prisma, 'uid-1', 39)
    expect(result?.toISOString()).toBe(manual.toISOString())
  })

  it('수동 갱신 전용 timestamp 필드 — manualRefreshedAt 반환', async () => {
    const manual = new Date('2026-06-18T12:00:00.000Z')
    const prisma = createPrismaMock({ manualRefreshedAt: manual, hasPlayerMatch: true })
    const result = await resolveProfileLastRefreshedAt(prisma, 'uid-1', 39)
    expect(result?.toISOString()).toBe(manual.toISOString())
  })

  it('partial backfill 재개 허용', () => {
    expect(
      shouldAllowAutoProfileBackfill({
        profileCached: true,
        explicitRefresh: false,
        backfillComplete: false,
      }),
    ).toBe(true)
  })
})
