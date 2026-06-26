import { describe, expect, it } from 'vitest'

import {
  assertStatsWriteIdentity,
  assertSummaryWriteIdentity,
} from '@/utils/profileCacheWriteGuard'

describe('profileCacheWriteGuard', () => {
  const baseCtx = {
    refreshNavigationKey: 'nav-a',
    activeNavigationKey: 'nav-a',
    expectedNickname: '마인',
    expectedUserNum: 1009897353,
  }

  it('navigationKey 불일치 시 summary write 차단', () => {
    expect(
      assertSummaryWriteIdentity(
        { userNum: 1009897353, nickname: '마인', level: 1, tier: 'GOLD1', currentSeason: 11 },
        { ...baseCtx, activeNavigationKey: 'nav-b' },
      ),
    ).toBe(false)
  })

  it('userNum 불일치 시 summary write 차단', () => {
    expect(
      assertSummaryWriteIdentity(
        { userNum: 460448438, nickname: '마인', level: 1, tier: 'GOLD1', currentSeason: 11 },
        baseCtx,
      ),
    ).toBe(false)
  })

  it('stats userNum 불일치 시 write 차단', () => {
    expect(
      assertStatsWriteIdentity(
        { userNum: 460448438, games: 1, winRate: 0, avgKills: 0, avgPlacement: 0, kda: 0, kdaString: '0', tier: 'GOLD', mmr: 0, mostPlayedCharacter: { name: '엠마', count: 1 } },
        baseCtx,
      ),
    ).toBe(false)
  })
})
