import { describe, expect, it } from 'vitest'

import { ApiError } from '@/utils/apiError'
import {
  fetchMatchDTOHistory,
  fetchMatchHistory,
  getPlayerSeasonAggregate,
  fetchPlayerByNickname,
  fetchPlayerStats,
  fetchPlayerStatsDTO,
  searchPlayers,
} from '@/api/player'

describe('player api (mock path, VITE_API_BASE_URL 비어 있음)', () => {
  it('searchPlayers', async () => {
    const res = await searchPlayers('네온')
    expect(res.source).toBe('cache')
    expect(res.data.some((p) => p.nickname === '네온샤워')).toBe(true)
  })

  it('searchPlayers — 2자 미만이면 INVALID_REQUEST', async () => {
    await expect(searchPlayers('a')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    } satisfies Partial<ApiError>)
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
    const res = await fetchPlayerStats('DuskLine902')
    expect(res.data.games).toBe(4)
  })

  it('fetchPlayerStats 없는 유저는 throw', async () => {
    await expect(fetchPlayerStats('없는닉네임xyz')).rejects.toThrow('Player stats not found')
  })

  it('fetchMatchHistory Paginated', async () => {
    const res = await fetchMatchHistory('한강쐐기', 0)
    expect(res.data.items.length).toBeLessThanOrEqual(10)
    expect(res.data.hasNext).toBeTypeOf('boolean')
    expect(res.data.page).toBe(0)
    expect(res.data.pageSize).toBe(10)
  })

  it('fetchPlayerStatsDTO 없는 유저 → PLAYER_NOT_FOUND', async () => {
    await expect(fetchPlayerStatsDTO('없는닉네임xyz')).rejects.toMatchObject({
      code: 'PLAYER_NOT_FOUND',
    })
  })

  it('fetchMatchDTOHistory 첫 페이지 첫 item에 DTO 필드 포함', async () => {
    const res = await fetchMatchDTOHistory('한강쐐기', 0)
    const first = res.data.items[0]
    expect(first).toBeDefined()
    expect(typeof first.kdaString).toBe('string')
    expect(typeof first.placementLabel).toBe('string')
    expect(typeof first.relativeTime).toBe('string')
    expect(typeof first.gameDurationLabel).toBe('string')
  })

  it('getPlayerSeasonAggregate mock path는 partial 빈 집계를 반환', async () => {
    const res = await getPlayerSeasonAggregate('한강쐐기', 11)
    expect(res.source).toBe('cache')
    expect(res.data.cacheStatus).toBe('partial')
    expect(res.data.characterStats).toEqual([])
    expect(res.data.rpSeries).toEqual([])
  })
})
