import { describe, expect, it } from 'vitest'

import { MATCHES_DTO_PAGE_SIZE } from '@/hooks/useMatchDTOHistory'
import { playerQueryKeys, playerQueryOwnerScope } from '@/utils/playerQueryKeys'

describe('useMatchDTOHistory constants', () => {
  it('최초 pageSize 기본값 10', () => {
    expect(MATCHES_DTO_PAGE_SIZE).toBe(10)
  })

  it('matchesDto query key에 matchMode와 owner scope 포함', () => {
    const scope = playerQueryOwnerScope({
      nickname: '마인',
      userNum: 1009897353,
      dataSource: 'real',
    })
    const key = playerQueryKeys.matchesDto(scope, MATCHES_DTO_PAGE_SIZE, 'rank')
    expect(key).toEqual(['player', 'real:1009897353', 'matches-dto', 'rank', 10])
  })
})
