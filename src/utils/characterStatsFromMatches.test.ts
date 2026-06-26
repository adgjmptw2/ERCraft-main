import { describe, expect, it } from 'vitest'

import type { MatchSummary } from '@/types/match'
import {
  buildProfileCharacterReports,
  filterSeasonMatches,
  profileCharacterStatsBasisLabel,
  sortMatchesByDateDesc,
} from '@/utils/characterStatsFromMatches'

function makeMatch(partial: Partial<MatchSummary> & Pick<MatchSummary, 'matchId'>): MatchSummary {
  return {
    userNum: 1,
    characterName: 'Yuki',
    placement: 3,
    kills: 2,
    deaths: 1,
    assists: 1,
    gameStartedAt: '2026-06-10T10:00:00+09:00',
    victory: true,
    gameMode: 'rank',
    ...partial,
  }
}

describe('characterStatsFromMatches', () => {
  it('sortMatchesByDateDesc — 최신 경기 우선', () => {
    const matches = [
      makeMatch({ matchId: 'old', gameStartedAt: '2026-06-01T10:00:00+09:00' }),
      makeMatch({ matchId: 'new', gameStartedAt: '2026-06-10T10:00:00+09:00' }),
    ]
    expect(sortMatchesByDateDesc(matches).map((m) => m.matchId)).toEqual(['new', 'old'])
  })

  it('filterSeasonMatches — seasonNumber fallback 적용', () => {
    const matches = [
      makeMatch({ matchId: 'a', seasonNumber: 10 }),
      makeMatch({ matchId: 'b' }),
      makeMatch({ matchId: 'c', seasonNumber: 9 }),
    ]
    expect(filterSeasonMatches(matches, 10, 10)).toHaveLength(2)
    expect(filterSeasonMatches(matches, 10, 10).map((m) => m.matchId)).toEqual(['a', 'b'])
  })

  it('filterSeasonMatches — 현재 시즌 표시값과 API seasonId가 다르면 현재 로드 경기 유지', () => {
    const matches = [
      makeMatch({ matchId: 'api-a', seasonNumber: 39 }),
      makeMatch({ matchId: 'api-b', seasonNumber: 39 }),
    ]

    expect(filterSeasonMatches(matches, 11, 11).map((m) => m.matchId)).toEqual([
      'api-a',
      'api-b',
    ])
    expect(filterSeasonMatches(matches, 10, 11)).toHaveLength(0)
  })

  it('characterNum이 있으면 잘못된 characterName보다 공식 한국어명 우선', () => {
    const reports = buildProfileCharacterReports([
      makeMatch({ matchId: 'a', characterNum: 15, characterName: 'Chiara', gameMode: 'rank' }),
      makeMatch({ matchId: 'b', characterNum: 15, characterName: '키아라', gameMode: 'rank' }),
      makeMatch({ matchId: 'c', characterNum: 15, characterName: 'Sissela', gameMode: 'rank' }),
    ])
    expect(reports).toHaveLength(1)
    expect(reports[0]?.characterName).toBe('시셀라')
    expect(reports[0]?.characterNum).toBe(15)
  })

  it('characterNum 기준 groupBy', () => {
    const reports = buildProfileCharacterReports([
      makeMatch({ matchId: 'a', characterNum: 11, characterName: 'Yuki', kills: 3 }),
      makeMatch({ matchId: 'b', characterNum: 11, characterName: 'Yuki', kills: 1 }),
      makeMatch({ matchId: 'c', characterNum: 24, characterName: 'Adela', kills: 5 }),
    ])
    expect(reports).toHaveLength(2)
    const yuki = reports.find((r) => r.characterNum === 11)
    expect(yuki?.matchCount).toBe(2)
  })

  it('같은 characterName이어도 characterNum이 다르면 구분', () => {
    const reports = buildProfileCharacterReports([
      makeMatch({ matchId: 'a', characterNum: 11, characterName: 'Duplicate' }),
      makeMatch({ matchId: 'b', characterNum: 12, characterName: 'Duplicate' }),
    ])
    expect(reports).toHaveLength(2)
  })

  it('characterNum 없을 때 characterName fallback group', () => {
    const reports = buildProfileCharacterReports([
      makeMatch({ matchId: 'a', characterName: 'Hyunwoo' }),
      makeMatch({ matchId: 'b', characterName: 'Hyunwoo' }),
    ])
    expect(reports).toHaveLength(1)
    expect(reports[0]?.matchCount).toBe(2)
  })

  it('1~2판 캐릭터는 표본 부족', () => {
    const reports = buildProfileCharacterReports([
      makeMatch({ matchId: 'a', characterNum: 11, characterName: 'Yuki' }),
    ])
    expect(reports[0]?.status).toBe('insufficient-sample')
    expect(reports[0]?.overallGrade).toBeNull()
    expect(reports[0]?.gradeLabel).toBe('표본 부족')
  })

  it('최근 n경기 기준 문구', () => {
    expect(profileCharacterStatsBasisLabel(12)).toBe('최근 12경기 기준')
  })

  it('랭크 경기만 집계', () => {
    const reports = buildProfileCharacterReports([
      makeMatch({ matchId: 'a', characterNum: 11, gameMode: 'rank' }),
      makeMatch({ matchId: 'b', characterNum: 11, gameMode: 'normal' }),
      makeMatch({ matchId: 'c', characterNum: 11, gameMode: 'cobalt' }),
      makeMatch({ matchId: 'd', characterNum: 11, gameMode: 'rank' }),
      makeMatch({ matchId: 'e', characterNum: 11, gameMode: 'rank' }),
    ])
    expect(reports[0]?.matchCount).toBe(3)
  })

  it('SSS/상위/백분위 문자열이 생성되지 않음', () => {
    const reports = buildProfileCharacterReports(
      Array.from({ length: 6 }, (_, i) =>
        makeMatch({
          matchId: `m-${i}`,
          characterNum: 11,
          characterName: 'Yuki',
          placement: i % 3 === 0 ? 1 : 4,
        }),
      ),
    )
    const serialized = JSON.stringify(reports)
    expect(serialized).not.toMatch(/SSS|상위|백분위|%/)
  })
})
