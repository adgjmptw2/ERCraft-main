import { describe, expect, it } from 'vitest'

import { buildRpTrendPointsFromMatches, RP_TREND_RECENT_LIMIT } from '@/utils/rpTrendPoints'

describe('rpTrendPoints', () => {
  it('같은 날 여러 판은 마무리 RP 1점 + min/max', () => {
    const matches = [
      { matchId: 'a', gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: 8100, rpDelta: -20 },
      { matchId: 'b', gameStartedAt: '2026-06-10T14:00:00+09:00', rpAfter: 8050, rpDelta: -50 },
      { matchId: 'c', gameStartedAt: '2026-06-10T20:00:00+09:00', rpAfter: 8200, rpDelta: 150 },
    ]

    const points = buildRpTrendPointsFromMatches(matches, () => '6/10')
    expect(points).toHaveLength(1)
    expect(points[0]?.rpAfter).toBe(8200)
    expect(points[0]?.dayMinRp).toBe(8050)
    expect(points[0]?.dayMaxRp).toBe(8200)
    expect(points[0]?.gamesPlayed).toBe(3)
  })

  it('랭크 친 날만 최근 7일까지 반환', () => {
    const matches = Array.from({ length: 10 }, (_, i) => ({
      matchId: `m-${i}`,
      gameStartedAt: new Date(2026, 5, 1 + i).toISOString(),
      rpAfter: 8000 + i * 10,
    }))

    const points = buildRpTrendPointsFromMatches(matches, (iso) => iso.slice(5, 10))
    expect(points).toHaveLength(RP_TREND_RECENT_LIMIT)
    expect(points[0]?.rpAfter).toBe(8030)
    expect(points.at(-1)?.rpAfter).toBe(8090)
  })

  it('경기 없는 달력일은 채우지 않음 — 랭크 친 날만', () => {
    const matches = [
      { matchId: 'a', gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: 8100 },
      { matchId: 'b', gameStartedAt: '2026-06-12T10:00:00+09:00', rpAfter: 8743 },
    ]

    const points = buildRpTrendPointsFromMatches(matches, (iso) => {
      const d = new Date(iso)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })

    expect(points).toHaveLength(2)
    expect(points[0]?.rpAfter).toBe(8100)
    expect(points[1]?.rpAfter).toBe(8743)
    expect(points.every((p) => (p.gamesPlayed ?? 0) > 0)).toBe(true)
  })
})
