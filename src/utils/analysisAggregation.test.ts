import { describe, expect, it } from 'vitest'

import type { MatchSummary } from '@/types/match'
import {
  analysisSeedFromMatches,
  getAnalysisBasisLabel,
  resolveAnalysisScope,
  selectAnalysisMatches,
} from '@/utils/analysisAggregation'

function match(id: string, gameMode?: MatchSummary['gameMode']): MatchSummary {
  return {
    matchId: id,
    userNum: 1,
    characterName: 'Yuki',
    placement: 3,
    kills: 3,
    deaths: 2,
    assists: 2,
    gameStartedAt: '2026-04-01T00:00:00.000Z',
    victory: true,
    gameMode,
  }
}

describe('analysisAggregation', () => {
  it('현재 시즌 recent20은 랭크 최근 20판만', () => {
    const seasonMatches = [
      ...Array.from({ length: 25 }, (_, i) => match(`rank-${i}`, 'rank')),
      match('cobalt-1', 'cobalt'),
    ]

    const selected = selectAnalysisMatches(seasonMatches, 11, 'recent20', 11)
    expect(selected).toHaveLength(20)
    expect(selected.every((m) => m.gameMode === 'rank')).toBe(true)
  })

  it('현재 시즌 seasonAll은 랭크 전체', () => {
    const seasonMatches = [
      ...Array.from({ length: 25 }, (_, i) => match(`rank-${i}`, 'rank')),
      match('cobalt-1', 'cobalt'),
    ]

    const selected = selectAnalysisMatches(seasonMatches, 11, 'seasonAll', 11)
    expect(selected).toHaveLength(25)
  })

  it('과거 시즌은 scope와 무관하게 랭크 전체', () => {
    const seasonMatches = [match('rank-1', 'rank'), match('normal-1', 'normal')]

    expect(selectAnalysisMatches(seasonMatches, 10, 'recent20', 11)).toHaveLength(1)
    expect(selectAnalysisMatches(seasonMatches, 10, 'seasonAll', 11)).toHaveLength(1)
  })

  it('집계 기준 라벨', () => {
    expect(getAnalysisBasisLabel(11, 'recent20', 11)).toBe('랭크 · 최근 20판 기준')
    expect(getAnalysisBasisLabel(11, 'seasonAll', 11)).toBe('랭크 · S11 시즌 전체 기준')
    expect(getAnalysisBasisLabel(10, 'recent20', 11)).toBe('랭크 · S10 시즌 전체 기준')
  })

  it('resolveAnalysisScope는 과거 시즌을 seasonAll로 고정', () => {
    expect(resolveAnalysisScope(10, 'recent20', 11)).toBe('seasonAll')
    expect(resolveAnalysisScope(11, 'recent20', 11)).toBe('recent20')
  })

  it('analysisSeedFromMatches는 scope별 다른 시드', () => {
    const matches = [match('a', 'rank')]
    expect(analysisSeedFromMatches(matches, 11, 'recent20')).not.toBe(
      analysisSeedFromMatches(matches, 11, 'seasonAll'),
    )
  })
})
