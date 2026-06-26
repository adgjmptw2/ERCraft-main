import { describe, expect, it } from 'vitest'

import {
  buildRealModeRpChartViewModel,
  buildRpMatchSeriesFromMatches,
  getRpChartState,
  shortRpDateLabel,
} from '@/utils/rpSeries'
import { RP_TREND_RECENT_LIMIT } from '@/utils/rpTrendPoints'

describe('rpSeries', () => {
  const format = () => '6/10'

  it('RP 시계열이 없으면 unavailable', () => {
    const vm = buildRealModeRpChartViewModel([])
    expect(vm.state).toBe('unavailable')
    expect(vm.points).toHaveLength(0)
    expect(vm.emptyTitle).toContain('RP 흐름')
  })

  it('랭크 친 날이 1일뿐이면 insufficientData', () => {
    const matches = [
      { matchId: 'a', gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: 8100 },
    ]
    expect(getRpChartState(matches, buildRpMatchSeriesFromMatches(matches, format))).toBe(
      'insufficientData',
    )
    const vm = buildRealModeRpChartViewModel(matches, format)
    expect(vm.state).toBe('insufficientData')
    expect(vm.points).toHaveLength(1)
    expect(vm.emptyTitle).toContain('충분하지 않습니다')
  })

  it('real 모드 — 일별 마무리 RP 최대 7일', () => {
    const matches = Array.from({ length: 10 }, (_, day) => ({
      matchId: `d-${day}`,
      gameStartedAt: `2026-06-${String(day + 1).padStart(2, '0')}T22:00:00+09:00`,
      rpAfter: 8000 + day * 10,
    }))
    const vm = buildRealModeRpChartViewModel(matches, shortRpDateLabel)
    expect(vm.state).toBe('ready')
    expect(vm.points).toHaveLength(RP_TREND_RECENT_LIMIT)
    expect(vm.description).toContain(String(RP_TREND_RECENT_LIMIT))
  })

  it('real 모드 — 같은 날 여러 판은 dayMinRp/dayMaxRp 포함', () => {
    const matches = [
      { matchId: 'a', gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: 8050 },
      { matchId: 'b', gameStartedAt: '2026-06-10T18:00:00+09:00', rpAfter: 8200 },
      { matchId: 'c', gameStartedAt: '2026-06-11T10:00:00+09:00', rpAfter: 8300 },
    ]
    const vm = buildRealModeRpChartViewModel(matches, format)
    const june10 = vm.points.find((p) => p.dayMinRp === 8050)
    expect(june10?.rpAfter).toBe(8200)
    expect(june10?.dayMinRp).toBe(8050)
    expect(june10?.dayMaxRp).toBe(8200)
    expect(vm.state).toBe('ready')
  })

  it('RP 값 null/undefined/NaN에서 깨지지 않음', () => {
    const matches = [
      { matchId: 'a', gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: undefined },
      { matchId: 'b', gameStartedAt: '2026-06-10T18:00:00+09:00', rpAfter: Number.NaN },
      { matchId: 'c', gameStartedAt: '2026-06-10T22:00:00+09:00', rpAfter: 8200 },
    ]
    const vm = buildRealModeRpChartViewModel(matches, format)
    expect(vm.state).toBe('insufficientData')
    expect(vm.points).toHaveLength(1)
  })
})
