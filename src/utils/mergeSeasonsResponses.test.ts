import { describe, expect, it } from 'vitest'

import type { PlayerSeasonsResponse } from '@/types/season'
import { mergeSeasonsResponses } from '@/utils/mergeSeasonsResponses'

const quick: PlayerSeasonsResponse = {
  currentSeason: 11,
  seasons: [
    {
      seasonNumber: 11,
      rank: { tier: '다이아몬드', division: 2, rp: 2400 },
      tier: '다이아몬드 2',
      wins: 10,
      losses: 5,
      avgPlacement: 3,
      kda: 2.5,
      top3Rate: 60,
      played: true,
    },
  ],
}

const full: PlayerSeasonsResponse = {
  currentSeason: 11,
  seasons: [
    ...quick.seasons,
    {
      seasonNumber: 10,
      rank: { tier: '플래티넘', division: 1, rp: 2000 },
      tier: '플래티넘 1',
      wins: 20,
      losses: 10,
      avgPlacement: 4,
      kda: 2,
      top3Rate: 40,
      played: true,
    },
  ],
}

describe('mergeSeasonsResponses', () => {
  it('과거·현재 응답을 seasonNumber 기준 병합', () => {
    const merged = mergeSeasonsResponses(full, quick)
    expect(merged?.seasons).toHaveLength(2)
    expect(merged?.seasons.map((s) => s.seasonNumber)).toEqual([10, 11])
  })

  it('현재 시즌만 있을 때 빠른 응답 사용', () => {
    expect(mergeSeasonsResponses(undefined, quick)?.seasons).toHaveLength(1)
  })

  it('과거 시즌만 있을 때 과거 응답 사용', () => {
    expect(mergeSeasonsResponses(full, undefined)?.seasons).toHaveLength(2)
  })
})
