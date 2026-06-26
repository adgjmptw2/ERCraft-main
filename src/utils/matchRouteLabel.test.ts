import { describe, expect, it } from 'vitest'

import { formatMatchRouteLabel } from '@/utils/matchRouteLabel'

describe('formatMatchRouteLabel', () => {
  it('공개 루트 — routeIdOfStart를 표시', () => {
    expect(
      formatMatchRouteLabel({
        gameMode: 'rank',
        routeIdOfStart: 12345,
        routeSlotId: 1,
      }),
    ).toBe('루트 #12345')
  })

  it('routeSlotId 0이어도 실제 routeIdOfStart를 표시', () => {
    expect(
      formatMatchRouteLabel({
        gameMode: 'rank',
        routeIdOfStart: 13007,
        routeSlotId: 0,
      }),
    ).toBe('루트 #13007')
  })

  it('미공개 루트(routeSlotId -1) — 루트 -', () => {
    expect(
      formatMatchRouteLabel({
        gameMode: 'normal',
        routeIdOfStart: 2799,
        routeSlotId: -1,
      }),
    ).toBe('루트 -')
  })

  it('코발트 — 루트 -', () => {
    expect(
      formatMatchRouteLabel({
        gameMode: 'cobalt',
        routeIdOfStart: 18412,
        routeSlotId: 3,
      }),
    ).toBe('루트 -')
  })

  it('API 필드 없으면 mock demoRouteId 사용', () => {
    expect(
      formatMatchRouteLabel({
        gameMode: 'rank',
        demoRouteId: 45231,
      }),
    ).toBe('루트 #45231')
  })

  it('routeSlotId가 없어도 routeIdOfStart를 표시', () => {
    expect(
      formatMatchRouteLabel({
        gameMode: 'rank',
        routeIdOfStart: 12345,
      }),
    ).toBe('루트 #12345')
  })

  it('루트 정보 없으면 루트 -', () => {
    expect(formatMatchRouteLabel({ gameMode: 'normal' })).toBe('루트 -')
  })
})
