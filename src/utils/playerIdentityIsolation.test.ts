import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { gateMatchItemsByOwner } from '@/utils/profileOwnerGate'
import {
  normalizePlayerNickname,
  playerQueryKeys,
  playerQueryOwnerScope,
} from '@/utils/playerQueryKeys'

const PLAYER_A = {
  nickname: '마인',
  userNum: 1009897353,
}

const PLAYER_B = {
  nickname: '하잉',
  userNum: 460448438,
}

const realScopeA = playerQueryOwnerScope({
  nickname: PLAYER_A.nickname,
  userNum: PLAYER_A.userNum,
  dataSource: 'real',
})
const realScopeB = playerQueryOwnerScope({
  nickname: PLAYER_B.nickname,
  userNum: PLAYER_B.userNum,
  dataSource: 'real',
})

describe('player identity isolation — query keys', () => {
  it('A와 B의 queryKey가 서로 다르다', () => {
    expect(playerQueryKeys.summary(playerQueryOwnerScope({ nickname: PLAYER_A.nickname, dataSource: 'real' }))).not.toEqual(
      playerQueryKeys.summary(playerQueryOwnerScope({ nickname: PLAYER_B.nickname, dataSource: 'real' })),
    )
    expect(playerQueryKeys.statsDto(realScopeA, '')).not.toEqual(
      playerQueryKeys.statsDto(realScopeB, ''),
    )
    expect(playerQueryKeys.matchesDto(realScopeA, 10)).not.toEqual(
      playerQueryKeys.matchesDto(realScopeB, 10),
    )
    expect(playerQueryKeys.seasons(realScopeA, 1, 11)).not.toEqual(
      playerQueryKeys.seasons(realScopeB, 1, 11),
    )
  })

  it('정규화된 nickname이 동일 root key를 공유하지 않는다', () => {
    expect(normalizePlayerNickname(PLAYER_A.nickname)).not.toBe(
      normalizePlayerNickname(PLAYER_B.nickname),
    )
  })
})

describe('player identity isolation — matches gate', () => {
  it('다른 userNum 경기는 현재 owner 화면에서 제외된다', () => {
    const items = [
      { userNum: PLAYER_A.userNum, matchId: 'a1' },
      { userNum: PLAYER_B.userNum, matchId: 'b1' },
    ]
    expect(gateMatchItemsByOwner(items, PLAYER_A.userNum)).toEqual([
      { userNum: PLAYER_A.userNum, matchId: 'a1' },
    ])
  })

  it('owner 미확정이면 matches를 비운다', () => {
    const items = [{ userNum: PLAYER_B.userNum, matchId: 'b1' }]
    expect(gateMatchItemsByOwner(items, null)).toEqual([])
  })
})

describe('player identity cross-contamination — cache writes', () => {
  it('setQueryData는 대상 사용자 scope만 변경한다', () => {
    const client = new QueryClient()
    client.setQueryData(playerQueryKeys.statsDto(realScopeA, ''), {
      data: { userNum: PLAYER_A.userNum, games: 1 },
    })
    client.setQueryData(playerQueryKeys.statsDto(realScopeB, ''), {
      data: { userNum: PLAYER_B.userNum, games: 2 },
    })
    client.setQueryData(playerQueryKeys.statsDto(realScopeA, ''), {
      data: { userNum: PLAYER_A.userNum, games: 99 },
    })
    expect(
      (client.getQueryData(playerQueryKeys.statsDto(realScopeB, '')) as { data: { games: number } })
        .data.games,
    ).toBe(2)
  })

  it('demo 마인과 real 마인 stats key가 분리된다', () => {
    const demoScope = playerQueryOwnerScope({
      nickname: '마인',
      userNum: 920517,
      dataSource: 'demo',
    })
    expect(playerQueryKeys.statsDto(demoScope, '')).not.toEqual(
      playerQueryKeys.statsDto(realScopeA, ''),
    )
  })
})
