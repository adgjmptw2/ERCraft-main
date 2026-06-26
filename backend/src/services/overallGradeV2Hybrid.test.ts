import { describe, expect, it } from 'vitest'

import {
  computeOverallGradeV2Hybrid,
  resolveCharacterWeightedBaseScore,
  scoreToOverallGrade,
} from './overallGradeV2Hybrid.js'
import type { SeasonCharacterAggregateContract } from '../contracts/player.js'

function compute(params: {
  baseScore: number | null
  outcomePerformanceScore?: number | null
  consistencyScore?: number | null
  confidenceLabel?: 'high' | 'medium' | 'low' | 'insufficient'
}) {
  return computeOverallGradeV2Hybrid({
    baseScore: params.baseScore,
    weightedMatchCount: 40,
    gradedCharacterCount: 2,
    outcomePerformanceScore:
      'outcomePerformanceScore' in params ? params.outcomePerformanceScore ?? null : 65,
    consistencyScore:
      'consistencyScore' in params ? params.consistencyScore ?? null : 65,
    matchMode: 'rank',
    confidence: 0.9,
    confidenceLabel: params.confidenceLabel ?? 'high',
  })
}

describe('overallGradeV2Hybrid', () => {
  it('keeps neutral outcome and consistency at the base score', () => {
    expect(compute({ baseScore: 70 })?.overallPerformanceScore).toBe(70)
  })

  it('clamps outcome modifier to -4 and +4', () => {
    expect(compute({ baseScore: 70, outcomePerformanceScore: 0 })?.outcomeModifier).toBe(-4)
    expect(compute({ baseScore: 70, outcomePerformanceScore: 100 })?.outcomeModifier).toBe(4)
  })

  it('clamps consistency modifier to -2 and +2', () => {
    expect(compute({ baseScore: 70, consistencyScore: 0 })?.consistencyModifier).toBe(-2)
    expect(compute({ baseScore: 70, consistencyScore: 100 })?.consistencyModifier).toBe(2)
  })

  it('limits total delta to +/-6 and clamps final score to 0..100', () => {
    expect(compute({ baseScore: 70, outcomePerformanceScore: 100, consistencyScore: 100 })?.totalModifier).toBe(6)
    expect(compute({ baseScore: 3, outcomePerformanceScore: 0, consistencyScore: 0 })?.overallPerformanceScore).toBe(0)
    expect(compute({ baseScore: 98, outcomePerformanceScore: 100, consistencyScore: 100 })?.overallPerformanceScore).toBe(100)
  })

  it('falls back to base when components are missing or confidence is insufficient', () => {
    expect(compute({ baseScore: 70, outcomePerformanceScore: null })?.overallScoreSource).toBe(
      'character-grade-weighted-average-fallback',
    )
    expect(compute({ baseScore: 70, confidenceLabel: 'insufficient' })?.overallScoreSource).toBe(
      'character-grade-weighted-average-fallback',
    )
  })

  it('does not apply to non-rank modes', () => {
    const result = computeOverallGradeV2Hybrid({
      baseScore: 70,
      weightedMatchCount: 40,
      gradedCharacterCount: 2,
      outcomePerformanceScore: 100,
      consistencyScore: 100,
      matchMode: 'cobalt',
      confidence: 1,
      confidenceLabel: 'high',
    })

    expect(result?.overallScoreSource).toBe('character-grade-weighted-average-fallback')
    expect(result?.overallPerformanceScore).toBe(70)
  })

  it('uses existing character weighted average as base score', () => {
    const rows: SeasonCharacterAggregateContract[] = [
      {
        characterNum: 1,
        games: 10,
        wins: 5,
        winRate: 50,
        avgRank: 3,
        kills: 10,
        assists: 10,
        deaths: 5,
        kda: 4,
        avgTeamKills: 4,
        avgKills: 1,
        avgDamage: 1000,
        gradeLabel: 'A',
        gradeStatus: 'ok',
        gradeScore: 80,
        gradeSampleSize: 10,
      },
      {
        characterNum: 2,
        games: 30,
        wins: 5,
        winRate: 16.67,
        avgRank: 5,
        kills: 10,
        assists: 10,
        deaths: 10,
        kda: 2,
        avgTeamKills: 4,
        avgKills: 0.33,
        avgDamage: 1000,
        gradeLabel: 'B',
        gradeStatus: 'ok',
        gradeScore: 60,
        gradeSampleSize: 30,
      },
    ]

    expect(resolveCharacterWeightedBaseScore(rows)).toMatchObject({
      baseScore: 65,
      weightedMatchCount: 40,
      gradedCharacterCount: 2,
    })
  })

  it('maps overall coarse grades deterministically', () => {
    expect(scoreToOverallGrade(88)).toBe('S')
    expect(scoreToOverallGrade(72)).toBe('A')
    expect(scoreToOverallGrade(56)).toBe('B')
    expect(scoreToOverallGrade(38)).toBe('C')
    expect(scoreToOverallGrade(37.99)).toBe('D')
  })
})
