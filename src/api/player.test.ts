import { describe, expect, it } from 'vitest'

import {
  fetchMatchHistory,
  fetchPlayerByNickname,
  fetchPlayerStats,
  searchPlayers,
} from '@/api/player'

describe('player api (mock path, no BSER key)', () => {
  it('searchPlayers', async () => {
    const res = await searchPlayers('네온')
    expect(res.source).toBe('cache')
    expect(res.data.some((p) => p.nickname === '네온샤워')).toBe(true)
  })

  it('fetchPlayerByNickname — 있으면 요약', async () => {
    const res = await fetchPlayerByNickname('RustyMango')
    expect(res.data?.nickname).toBe('RustyMango')
    expect(res.data?.userNum).toBe(192044)
  })

  it('fetchPlayerByNickname — 없으면 null', async () => {
    const res = await fetchPlayerByNickname('없는닉네임xyz')
    expect(res.data).toBeNull()
  })

  it('fetchPlayerStats', async () => {
    const res = await fetchPlayerStats(560733)
    expect(res.data.games).toBe(4)
    expect(res.data.avgPlacement).toBeDefined()
  })

  it('fetchPlayerStats 없는 유저는 throw', async () => {
    await expect(fetchPlayerStats(999_999)).rejects.toThrow('Player stats not found')
  })

  it('fetchMatchHistory Paginated', async () => {
    const res = await fetchMatchHistory(847291, 0)
    expect(res.data.items.length).toBeLessThanOrEqual(10)
    expect(res.data.hasNext).toBeTypeOf('boolean')
    expect(res.data.page).toBe(0)
    expect(res.data.pageSize).toBe(10)
  })
})
