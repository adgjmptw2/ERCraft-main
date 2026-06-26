import { describe, expect, it } from 'vitest'

import {
  ALL_CHARACTER_CONFIDENCE_HIGH_MIN,
  computeAnalysisEligibility,
  formatAllCharacterInsufficientMessage,
  isAllCharacterAnalysisSampleSufficient,
  isAnalysisScopeGameMode,
  resolveAllCharacterDataConfidence,
  SPECIFIC_CHARACTER_ANALYSIS_MIN_ELIGIBLE,
} from '@/analysis/analysisEligibility'
import type { MatchSummary } from '@/types/match'

function makeMatch(overrides: Partial<MatchSummary> & { matchId: string }): MatchSummary {
  return {
    userNum: 1,
    gameStartedAt: '2026-06-01T00:00:00.000Z',
    characterName: 'Nathapon',
    characterNum: 1,
    placement: 3,
    kills: 2,
    assists: 1,
    deaths: 1,
    victory: false,
    seasonNumber: 11,
    gameMode: 'rank',
    ...overrides,
  }
}

function makeRankBatch(count: number, start = 0): MatchSummary[] {
  return Array.from({ length: count }, (_, index) =>
    makeMatch({ matchId: `rank-${start + index}` }),
  )
}

function makeNormalBatch(count: number, start = 0): MatchSummary[] {
  return Array.from({ length: count }, (_, index) =>
    makeMatch({ matchId: `normal-${start + index}`, gameMode: 'normal' }),
  )
}

describe('isAnalysisScopeGameMode', () => {
  it('all scope includes rank and normal only', () => {
    expect(isAnalysisScopeGameMode('rank', 'all')).toBe(true)
    expect(isAnalysisScopeGameMode('normal', 'all')).toBe(true)
    expect(isAnalysisScopeGameMode('cobalt', 'all')).toBe(false)
    expect(isAnalysisScopeGameMode('union', 'all')).toBe(false)
  })

  it('rank scope includes rank only', () => {
    expect(isAnalysisScopeGameMode('rank', 'rank')).toBe(true)
    expect(isAnalysisScopeGameMode('normal', 'rank')).toBe(false)
  })
})

describe('computeAnalysisEligibility all scope', () => {
  it('rank 16 + normal 4 => 20 eligible, analysis sufficient', () => {
    const result = computeAnalysisEligibility({
      matches: [...makeRankBatch(16), ...makeNormalBatch(4)],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(20)
    expect(result.breakdown.scopePoolMatches).toBe(20)
    expect(isAllCharacterAnalysisSampleSufficient(result.analysisEligibleMatches)).toBe(true)
  })

  it('rank 16 + normal 3 => 19 eligible, insufficient', () => {
    const result = computeAnalysisEligibility({
      matches: [...makeRankBatch(16), ...makeNormalBatch(3)],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(19)
    expect(isAllCharacterAnalysisSampleSufficient(result.analysisEligibleMatches)).toBe(false)
    expect(formatAllCharacterInsufficientMessage(result.breakdown, 'all')).toContain('19')
    expect(formatAllCharacterInsufficientMessage(result.breakdown, 'all')).toContain('20')
  })

  it('rank 16 + normal 14 => 30 eligible, high confidence', () => {
    const result = computeAnalysisEligibility({
      matches: [...makeRankBatch(16), ...makeNormalBatch(14)],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(30)
    expect(resolveAllCharacterDataConfidence(result.analysisEligibleMatches)).toBe('high')
    expect(result.analysisEligibleMatches).toBeGreaterThanOrEqual(ALL_CHARACTER_CONFIDENCE_HIGH_MIN)
  })

  it('rank 16 + cobalt 10 => eligible 16', () => {
    const result = computeAnalysisEligibility({
      matches: [
        ...makeRankBatch(16),
        ...Array.from({ length: 10 }, (_, index) =>
          makeMatch({ matchId: `cobalt-${index}`, gameMode: 'cobalt' }),
        ),
      ],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(16)
    expect(result.breakdown.excludedCobalt).toBe(10)
    expect(result.breakdown.scopePoolMatches).toBe(16)
  })

  it('rank 16 + union 10 => eligible 16', () => {
    const result = computeAnalysisEligibility({
      matches: [
        ...makeRankBatch(16),
        ...Array.from({ length: 10 }, (_, index) =>
          makeMatch({ matchId: `union-${index}`, gameMode: 'union' }),
        ),
      ],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(16)
    expect(result.breakdown.excludedUnion).toBe(10)
  })

  it('deduplicates game ids', () => {
    const result = computeAnalysisEligibility({
      matches: [makeMatch({ matchId: 'same' }), makeMatch({ matchId: 'same' }), ...makeRankBatch(18, 1)],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(19)
    expect(result.breakdown.excludedDuplicate).toBe(1)
  })

  it('rank scope excludes normal matches', () => {
    const result = computeAnalysisEligibility({
      matches: [...makeRankBatch(16), ...makeNormalBatch(8)],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'rank',
    })
    expect(result.analysisEligibleMatches).toBe(16)
    expect(result.breakdown.excludedOutOfScope).toBe(8)
    expect(result.breakdown.scopePoolMatches).toBe(16)
  })

  it('all scope includes normal matches', () => {
    const result = computeAnalysisEligibility({
      matches: [...makeRankBatch(10), ...makeNormalBatch(12)],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(22)
  })

  it('keeps sparse-metric matches in sample', () => {
    const result = computeAnalysisEligibility({
      matches: [
        makeMatch({ matchId: 'sparse', damageToPlayers: undefined, teamKills: undefined }),
        ...makeRankBatch(19, 1),
      ],
      seasonNumber: 11,
      seasonFallback: 11,
      scope: 'all',
    })
    expect(result.analysisEligibleMatches).toBe(20)
  })

  it('clears character filter when switching to all characters', () => {
    const matches = [
      ...makeRankBatch(10, 0).map((match, index) => ({
        ...match,
        characterName: 'Nathapon',
        characterNum: 1,
        matchId: `n-${index}`,
      })),
      ...makeRankBatch(12, 0).map((match, index) => ({
        ...match,
        characterName: 'Jan',
        characterNum: 2,
        matchId: `j-${index}`,
      })),
    ]
    const scoped = computeAnalysisEligibility({
      matches,
      seasonNumber: 11,
      seasonFallback: 11,
      characterKey: 'Nathapon',
      scope: 'all',
    })
    const all = computeAnalysisEligibility({
      matches,
      seasonNumber: 11,
      seasonFallback: 11,
      characterKey: null,
      scope: 'all',
    })
    expect(scoped.analysisEligibleMatches).toBe(10)
    expect(all.analysisEligibleMatches).toBe(22)
  })

  it('keeps specific-character minimum at 3', () => {
    expect(SPECIFIC_CHARACTER_ANALYSIS_MIN_ELIGIBLE).toBe(3)
  })

  it('defaults to all scope', () => {
    const result = computeAnalysisEligibility({
      matches: [...makeRankBatch(10), ...makeNormalBatch(10)],
      seasonNumber: 11,
      seasonFallback: 11,
    })
    expect(result.scope).toBe('all')
    expect(result.analysisEligibleMatches).toBe(20)
  })
})