import { describe, expect, it } from 'vitest'

import {
  normalizePlayerNickname,
  playerCacheOwnerSegment,
  playerQueryKeys,
  playerQueryOwnerScope,
} from '@/utils/playerQueryKeys'

const PLAYER_A = { nickname: '마인', userNum: 1009897353 }
const PLAYER_B = { nickname: '하잉', userNum: 460448438 }

describe('playerQueryKeys — owner scope isolation', () => {
  it('nickname trim 기준으로 pending summary 키가 안정적', () => {
    const scope = playerQueryOwnerScope({ nickname: '  마인 ', dataSource: 'real' })
    expect(playerQueryKeys.summary(scope)).toEqual(
      playerQueryKeys.summary(playerQueryOwnerScope({ nickname: '마인', dataSource: 'real' })),
    )
    expect(normalizePlayerNickname('  마인 ')).toBe('마인')
  })

  it('resolved UID가 있으면 nickname과 무관하게 동일 owner segment를 쓰지 않는다', () => {
    const scopeA = playerQueryOwnerScope({
      nickname: PLAYER_A.nickname,
      userNum: PLAYER_A.userNum,
      dataSource: 'real',
    })
    const scopeB = playerQueryOwnerScope({
      nickname: PLAYER_B.nickname,
      userNum: PLAYER_B.userNum,
      dataSource: 'real',
    })
    expect(playerCacheOwnerSegment(scopeA)).toBe('real:1009897353')
    expect(playerCacheOwnerSegment(scopeB)).toBe('real:460448438')
    expect(playerQueryKeys.statsDto(scopeA, '')).not.toEqual(playerQueryKeys.statsDto(scopeB, ''))
  })

  it('같은 owner scope 하위 쿼리는 root prefix를 공유', () => {
    const scope = playerQueryOwnerScope({
      nickname: PLAYER_A.nickname,
      userNum: PLAYER_A.userNum,
      dataSource: 'real',
    })
    const root = playerQueryKeys.root(scope)
    expect(playerQueryKeys.matchesDto(scope, 10).slice(0, root.length)).toEqual([...root])
    expect(playerQueryKeys.seasonAggregate(scope, 11).slice(0, root.length)).toEqual([...root])
  })

  it('statsDto는 tier별로 구분', () => {
    const scope = playerQueryOwnerScope({
      nickname: PLAYER_A.nickname,
      userNum: PLAYER_A.userNum,
      dataSource: 'real',
    })
    expect(playerQueryKeys.statsDto(scope, 'GOLD1')).not.toEqual(
      playerQueryKeys.statsDto(scope, 'GOLD2'),
    )
  })

  it('matchesDto는 pageSize와 matchMode별로 구분', () => {
    const scope = playerQueryOwnerScope({
      nickname: PLAYER_A.nickname,
      userNum: PLAYER_A.userNum,
      dataSource: 'real',
    })
    expect(playerQueryKeys.matchesDto(scope, 10, 'rank')).not.toEqual(
      playerQueryKeys.matchesDto(scope, 10, 'all'),
    )
    expect(playerQueryKeys.matchesDto(scope, 10, 'rank')).not.toEqual(
      playerQueryKeys.matchesDto(scope, 20, 'rank'),
    )
  })

  it('demo 마인과 real 마인의 query key가 분리된다', () => {
    const demoScope = playerQueryOwnerScope({
      nickname: '마인',
      userNum: 920517,
      dataSource: 'demo',
    })
    const realScope = playerQueryOwnerScope({
      nickname: '마인',
      userNum: 1009897353,
      dataSource: 'real',
    })
    expect(playerQueryKeys.statsDto(demoScope, '')).not.toEqual(
      playerQueryKeys.statsDto(realScope, ''),
    )
    expect(playerQueryKeys.matchesDto(demoScope, 10, 'all')).not.toEqual(
      playerQueryKeys.matchesDto(realScope, 10, 'all'),
    )
  })

  it('pending scope는 UID resolve 전 nickname으로 격리', () => {
    const pendingA = playerQueryOwnerScope({ nickname: PLAYER_A.nickname, dataSource: 'real' })
    const pendingB = playerQueryOwnerScope({ nickname: PLAYER_B.nickname, dataSource: 'real' })
    expect(playerQueryKeys.summary(pendingA)).not.toEqual(playerQueryKeys.summary(pendingB))
  })
})
