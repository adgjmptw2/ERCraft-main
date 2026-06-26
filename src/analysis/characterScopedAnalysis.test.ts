import { describe, expect, it } from 'vitest'

import {
  buildCharacterScopedPlayStyleAnalysis,
  filterMatchesByCharacter,
} from '@/analysis/characterScopedAnalysis'
import {
  getDemoAnalysisMatchesForSeason,
  getDemoPlayStylePopulationMatchSets,
} from '@/mocks/loader'

describe('characterScopedAnalysis', () => {
  it('filterMatchesByCharacter — 영문·한글 키 모두 매칭', () => {
    const matches = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')
    const english = filterMatchesByCharacter(matches, 'Yuki')
    const korean = filterMatchesByCharacter(matches, '유키')

    expect(english.length).toBeGreaterThan(0)
    expect(korean.length).toBe(english.length)
  })

  it('buildCharacterScopedPlayStyleAnalysis — 캐릭터별 6축 분석 생성', () => {
    const matches = getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')
    const scoped = filterMatchesByCharacter(matches, 'Yuki')

    const report = buildCharacterScopedPlayStyleAnalysis({
      characterKey: 'Yuki',
      playerMatches: matches,
      populationMatchSets: getDemoPlayStylePopulationMatchSets(11, 'recent20'),
      basisLabel: 'test',
    })

    expect(report.sampleSize).toBe(scoped.length)
    expect(report.status).toBe(scoped.length >= 3 ? 'ok' : 'insufficient')
  })
})
