import { describe, expect, it } from 'vitest'

import { mapBserGamesToMatchDetail } from '../external/matchDetailMapper.js'

describe('mapBserGamesToMatchDetail', () => {
  it('participants를 team/rank 순으로 그룹', () => {
    const detail = mapBserGamesToMatchDetail({
      gameId: '42',
      characterNames: new Map([[1, '유키'], [2, '재키'], [3, '엠마']]),
      games: [
        {
          gameId: 42,
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 10,
          gameRank: 2,
          playerKill: 1,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: 'a',
          teamNumber: 5,
        },
        {
          gameId: 42,
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 2,
          characterLevel: 10,
          gameRank: 1,
          playerKill: 3,
          playerAssistant: 1,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: 'b',
          teamNumber: 3,
        },
      ],
    })

    expect(detail.detailStatus).toBe('ready')
    expect(detail.teams[0]?.teamRank).toBe(1)
    expect(detail.teams[0]?.teamNumber).toBe(3)
    expect(detail.teams[1]?.teamRank).toBe(2)
  })

  it('viewContribution를 visionScore로 매핑한다', () => {
    const detail = mapBserGamesToMatchDetail({
      gameId: '99',
      characterNames: new Map([[1, '유키']]),
      games: [
        {
          gameId: 99,
          seasonId: 20,
          matchingMode: 3,
          matchingTeamMode: 3,
          characterNum: 1,
          characterLevel: 10,
          gameRank: 1,
          playerKill: 1,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 1,
          startDtm: '2026-06-01T00:00:00Z',
          nickname: '하잉',
          teamNumber: 1,
          viewContribution: 1391,
        },
      ],
    })

    expect(detail.teams[0]?.participants[0]?.visionScore).toBe(1391)
  })
})
