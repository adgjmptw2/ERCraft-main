import { describe, expect, it } from 'vitest'

import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerSeasonAggregateDTO } from '@/types/player'
import {
  isRichSeasonAggregate,
  shouldAllowLiveAggregateUpdate,
  shouldAllowLiveCharacterReports,
  shouldFreezeProfileSnapshot,
} from '@/utils/profileSnapshotPolicy'

function aggregate(
  overrides: Partial<PlayerSeasonAggregateDTO> = {},
): PlayerSeasonAggregateDTO {
  return {
    userNum: 1,
    seasonId: 11,
    apiSeasonId: 39,
    cacheStatus: 'ready',
    source: 'mixed',
    basisLabel: 'test',
    isRefreshing: false,
    characterStats: [
      {
        characterNum: 31,
        games: 335,
        wins: 47,
        winRate: 14,
        avgRank: 4,
        kills: 300,
        assists: 400,
        deaths: 200,
        kda: 3.5,
        avgTeamKills: 8,
        avgKills: 2.5,
        avgDamage: 13000,
        gradeLabel: 'A',
      },
    ],
    rpSeries: [{ matchId: 'm-1', dateLabel: '6. 10.', rpAfter: 8550 }],
    lastRefreshedAt: new Date().toISOString(),
    ...overrides,
  }
}

function report(kda: number): CharacterAnalysisReport {
  return {
    characterNum: 31,
    characterName: '엘마',
    matchCount: 335,
    avgPlacement: 4,
    avgKills: 2.5,
    avgAssists: 2,
    avgTeamKills: 8,
    avgDamageToPlayers: 12000,
    kda,
    top3Rate: 40,
    winRate: 30,
    overallScore: null,
    status: 'ok',
    overallGrade: 'A',
    gradeLabel: 'A',
    feedback: 'test',
  }
}

describe('profileSnapshotPolicy', () => {
  it('rich cache 유저는 freeze', () => {
    expect(
      shouldFreezeProfileSnapshot({
        hasRichDisplayedSnapshot: true,
        isFirstCollect: false,
        manualRefreshActive: false,
      }),
    ).toBe(true)
  })

  it('첫 수집은 freeze 하지 않음', () => {
    expect(
      shouldFreezeProfileSnapshot({
        hasRichDisplayedSnapshot: true,
        isFirstCollect: true,
        manualRefreshActive: false,
      }),
    ).toBe(false)
  })

  it('명시적 갱신 중에는 freeze 해제', () => {
    expect(
      shouldFreezeProfileSnapshot({
        hasRichDisplayedSnapshot: true,
        isFirstCollect: false,
        manualRefreshActive: true,
      }),
    ).toBe(false)
  })

  it('frozen 상태에서 sparse aggregate 거부', () => {
    const displayed = aggregate()
    const sparse = aggregate({
      rpSeries: [],
      characterStats: [
        {
          characterNum: 31,
          games: 335,
          wins: 47,
          winRate: 14,
          avgRank: 4,
          kills: 0,
          assists: 0,
          deaths: 0,
          kda: Number.NaN,
          avgTeamKills: null,
          avgKills: Number.NaN,
          avgDamage: null,
          gradeLabel: '시즌',
        },
      ],
    })

    expect(
      shouldAllowLiveAggregateUpdate({
        frozen: true,
        displayed,
        incoming: sparse,
      }),
    ).toBe(false)
  })

  it('빈 화면은 richer incoming 허용', () => {
    const incoming = aggregate()
    expect(
      shouldAllowLiveAggregateUpdate({
        frozen: true,
        displayed: null,
        incoming,
      }),
    ).toBe(true)
    expect(isRichSeasonAggregate(incoming)).toBe(true)
  })

  it('frozen 상태에서 combat-rich character stats 유지', () => {
    expect(
      shouldAllowLiveCharacterReports({
        frozen: true,
        displayed: [report(3.2)],
        incoming: [report(Number.NaN)],
      }),
    ).toBe(false)
  })

  it('freeze 해제 상태에서도 combat downgrade는 거부', () => {
    expect(
      shouldAllowLiveCharacterReports({
        frozen: false,
        displayed: [report(3.2)],
        incoming: [report(Number.NaN)],
      }),
    ).toBe(false)
  })
})
