import { describe, expect, it } from 'vitest'

import {
  buildCharacterAnalysisReports,
  buildCharacterAnalysisSummary,
  sortCharacterReports,
} from '@/analysis/characterReport'
import type { MatchSummary } from '@/types/match'

function makeMatch(
  overrides: Partial<MatchSummary> & Pick<MatchSummary, 'characterName'>,
): MatchSummary {
  return {
    matchId: `m-${Math.random()}`,
    userNum: 1,
    placement: 5,
    kills: 3,
    deaths: 3,
    assists: 2,
    gameStartedAt: '2026-04-01T00:00:00.000Z',
    victory: false,
    ...overrides,
  }
}

describe('buildCharacterAnalysisSummary', () => {
  it('캐릭터별 지표 계산', () => {
    const summary = buildCharacterAnalysisSummary('Yuki', [
      makeMatch({ characterName: 'Yuki', placement: 1, kills: 5, assists: 3, deaths: 1 }),
      makeMatch({ characterName: 'Yuki', placement: 3, kills: 3, assists: 2, deaths: 2 }),
    ])
    expect(summary).not.toBeNull()
    expect(summary?.matchCount).toBe(2)
    expect(summary?.avgPlacement).toBe(2)
    expect(summary?.top3Rate).toBe(100)
  })

  it('deaths 0이어도 KDA가 유한', () => {
    const summary = buildCharacterAnalysisSummary('A', [
      makeMatch({ characterName: 'A', kills: 4, deaths: 0, assists: 2 }),
    ])
    expect(summary?.kda).toBe(6)
    expect(Number.isFinite(summary?.kda)).toBe(true)
  })
})

describe('buildCharacterAnalysisReports', () => {
  it('빈 matches는 빈 배열', () => {
    expect(buildCharacterAnalysisReports([])).toEqual([])
  })

  it('캐릭터별 groupBy', () => {
    const reports = buildCharacterAnalysisReports([
      makeMatch({ characterName: 'Yuki', placement: 1 }),
      makeMatch({ characterName: 'Adela', placement: 5 }),
      makeMatch({ characterName: 'Yuki', placement: 2 }),
    ])
    expect(reports).toHaveLength(2)
    const yuki = reports.find((r) => r.characterName === 'Yuki')
    expect(yuki?.matchCount).toBe(2)
  })

  it('matchCount 1인 캐릭터는 grade null', () => {
    const reports = buildCharacterAnalysisReports([
      makeMatch({ characterName: 'Solo', placement: 1 }),
      makeMatch({ characterName: 'Duo', placement: 2 }),
      makeMatch({ characterName: 'Duo', placement: 3 }),
    ])
    const solo = reports.find((r) => r.characterName === 'Solo')
    expect(solo?.overallGrade).toBeNull()
    expect(solo?.gradeLabel).toBe('표본 부족')
  })

  it('matchCount 2 이상 캐릭터는 grade 계산', () => {
    const reports = buildCharacterAnalysisReports([
      makeMatch({ characterName: 'Good', placement: 1, kills: 8, assists: 5, deaths: 1, victory: true }),
      makeMatch({ characterName: 'Good', placement: 2, kills: 7, assists: 4, deaths: 2, victory: true }),
      makeMatch({ characterName: 'Bad', placement: 8, kills: 1, assists: 0, deaths: 6 }),
      makeMatch({ characterName: 'Bad', placement: 7, kills: 2, assists: 1, deaths: 5 }),
    ])
    const good = reports.find((r) => r.characterName === 'Good')
    const bad = reports.find((r) => r.characterName === 'Bad')
    expect(good?.overallGrade).not.toBeNull()
    expect(bad?.overallGrade).not.toBeNull()
    expect((good?.overallScore ?? 0)).toBeGreaterThan(bad?.overallScore ?? 0)
  })

  it('정렬: gradeable 우선, score 높은 순', () => {
    const reports = buildCharacterAnalysisReports([
      makeMatch({ characterName: 'Zeta', placement: 1 }),
      makeMatch({ characterName: 'Alpha', placement: 1, kills: 9, assists: 5, deaths: 0, victory: true }),
      makeMatch({ characterName: 'Alpha', placement: 1, kills: 8, assists: 4, deaths: 1, victory: true }),
      makeMatch({ characterName: 'Beta', placement: 6 }),
      makeMatch({ characterName: 'Beta', placement: 7 }),
    ])
    const sorted = sortCharacterReports(reports)
    expect(sorted[0]?.matchCount).toBeGreaterThanOrEqual(2)
    expect(sorted[0]?.characterName).toBe('Alpha')
  })
})
