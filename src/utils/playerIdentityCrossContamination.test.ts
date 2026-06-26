import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

const MINE = playerQueryOwnerScope({
  nickname: '마인',
  userNum: 1009897353,
  dataSource: 'real',
})
const HAYING = playerQueryOwnerScope({
  nickname: '하잉',
  userNum: 460448438,
  dataSource: 'real',
})

describe('player identity cross-contamination guards', () => {
  it('setQueryData는 대상 사용자 scope만 변경한다', () => {
    const client = new QueryClient()
    client.setQueryData(playerQueryKeys.statsDto(MINE, ''), {
      data: { userNum: MINE.userNum, games: 1 },
    })
    client.setQueryData(playerQueryKeys.statsDto(HAYING, ''), {
      data: { userNum: HAYING.userNum, games: 2 },
    })

    client.setQueryData(playerQueryKeys.statsDto(MINE, ''), {
      data: { userNum: MINE.userNum, games: 99 },
    })

    expect(
      (client.getQueryData(playerQueryKeys.statsDto(HAYING, '')) as { data: { games: number } }).data
        .games,
    ).toBe(2)
    expect(
      (client.getQueryData(playerQueryKeys.statsDto(MINE, '')) as { data: { games: number } }).data
        .games,
    ).toBe(99)
  })

  it('all/rank matchMode는 같은 사용자 내에서만 prefix 공유', () => {
    const rankKey = playerQueryKeys.matchesDto(MINE, 10, 'rank')
    const allKey = playerQueryKeys.matchesDto(MINE, 10, 'all')
    const otherUserAll = playerQueryKeys.matchesDto(HAYING, 10, 'all')

    expect(rankKey.slice(0, 2)).toEqual(allKey.slice(0, 2))
    expect(rankKey.slice(0, 2)).not.toEqual(otherUserAll.slice(0, 2))
    expect(rankKey).not.toEqual(allKey)
  })

  it('분석용 all matches query key가 사용자별로 분리된다', () => {
    expect(playerQueryKeys.matchesDto(MINE, 10, 'all')).not.toEqual(
      playerQueryKeys.matchesDto(HAYING, 10, 'all'),
    )
  })

  it('demo 마인과 real 마인 stats key가 분리된다', () => {
    const demoMine = playerQueryOwnerScope({
      nickname: '마인',
      userNum: 920517,
      dataSource: 'demo',
    })
    expect(playerQueryKeys.statsDto(demoMine, '')).not.toEqual(playerQueryKeys.statsDto(MINE, ''))
  })
})
