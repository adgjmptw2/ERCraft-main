import { describe, expect, it } from 'vitest'

import {
  aggregateGlobalPriorMean,
  aggregateSampleConfidence,
  applyAggregateSampleAdjustment,
  computeCharacterAggregateGradeV2,
  computeOverallAggregateGradeV2,
  robustWeightedMean10Pct,
  scoreToAggregateGrade,
  scoreToSharedFineAggregateGrade,
} from './aggregateGrade.js'
import { scoreToFineGrade } from './characterPerformanceGrade/config.js'

describe('aggregateGrade v2', () => {
  it('uses k=1 sample adjustment up to 19 games and raw score from 20 games', () => {
    const priorMean = 65
    const rawScore = 95
    const samples = [0, 1, 2, 3, 5, 10, 15, 18, 19, 20, 30, 50]

    for (const sampleSize of samples) {
      const adjusted = applyAggregateSampleAdjustment({ rawScore, sampleSize, priorMean })
      const expected =
        sampleSize === 0
          ? priorMean
          : sampleSize >= 20
            ? rawScore
            : priorMean + (sampleSize / (sampleSize + 1)) * (rawScore - priorMean)
      expect(adjusted).toBeCloseTo(expected, 8)
    }
  })

  it('reports sample confidence as 1 from 10 games for character aggregation evidence', () => {
    expect(aggregateSampleConfidence(8)).toBeCloseTo(8 / 9, 5)
    expect(aggregateSampleConfidence(9)).toBeCloseTo(9 / 10, 5)
    expect(aggregateSampleConfidence(10)).toBe(1)
    expect(aggregateSampleConfidence(18)).toBe(1)
    expect(aggregateSampleConfidence(30)).toBe(1)
  })

  it('shrinks scores above and below the prior toward the same broad mean', () => {
    const high = applyAggregateSampleAdjustment({ rawScore: 85, sampleSize: 10, priorMean: 65 })
    const low = applyAggregateSampleAdjustment({ rawScore: 45, sampleSize: 10, priorMean: 65 })

    expect(high).toBeCloseTo(83.181818, 5)
    expect(low).toBeCloseTo(46.818182, 5)
  })

  it('changes continuously at 9 to 10 and removes shrink from 20 games', () => {
    const nine = applyAggregateSampleAdjustment({ rawScore: 82, sampleSize: 9, priorMean: 65 })
    const ten = applyAggregateSampleAdjustment({ rawScore: 82, sampleSize: 10, priorMean: 65 })
    const nineteen = applyAggregateSampleAdjustment({ rawScore: 82, sampleSize: 19, priorMean: 65 })
    const twenty = applyAggregateSampleAdjustment({ rawScore: 82, sampleSize: 20, priorMean: 65 })

    expect(ten - nine).toBeLessThan(1)
    expect(nineteen).toBeCloseTo(81.15, 5)
    expect(twenty).toBe(82)
  })

  it('does not hard-cap a strong low-sample character grade', () => {
    const result = computeCharacterAggregateGradeV2({
      entries: Array.from({ length: 5 }, () => ({ score: 98, role: '스증 딜러' as const })),
    })

    expect(result.adjustedScore).not.toBeNull()
    expect(result.adjustedScore ?? 0).toBeGreaterThan(80)
    expect(result.grade).not.toBe('B')
    expect(result.grade).not.toBe('B+')
  })

  it('uses common fine-grade cuts for character aggregate grades', () => {
    const result = computeCharacterAggregateGradeV2({
      entries: Array.from({ length: 12 }, () => ({ score: 78, role: '스증 딜러' as const })),
    })

    expect(result.adjustedScore).not.toBeNull()
    expect(result.grade).toBe(scoreToFineGrade(result.adjustedScore ?? 0))
    expect(result.grade).not.toBe(scoreToAggregateGrade(result.adjustedScore, 'character'))
  })

  it('uses robust weighted mean from 10 character matches without deleting low games', () => {
    const scores = [40, 50, 70, 71, 72, 73, 74, 75, 95, 100]
    const robust = robustWeightedMean10Pct(scores)
    const result = computeCharacterAggregateGradeV2({
      entries: scores.map((score) => ({ score, role: '탱커' as const })),
    })

    expect(robust.tailCount).toBe(1)
    expect(robust.robustRaw).toBeCloseTo(
      (40 * 0.15 + 50 + 70 + 71 + 72 + 73 + 74 + 75 + 95 + 100 * 0.75) / 8.9,
      5,
    )
    expect(result.aggregation.aggregationPolicy).toBe('robust-weighted-10pct')
    expect(result.aggregation.confidence).toBe(1)
    expect(result.adjustedScore).toBeCloseTo(result.aggregation.robustRaw ?? 0, 2)
  })

  it('computes overall directly from match score entries, not character final grades', () => {
    const result = computeOverallAggregateGradeV2({
      entries: [
        { score: 80, role: '스증 딜러' },
        { score: 70, role: '스증 딜러' },
        { score: 60, role: '탱커' },
      ],
      gradedCharacterCount: 2,
    })

    const prior = aggregateGlobalPriorMean()
    const expected = prior + (3 / 4) * (70 - prior)
    expect(result?.basePerformanceScore).toBe(70)
    expect(result?.overallPerformanceScore).toBeCloseTo(expected, 2)
    expect(result?.weightedMatchCount).toBe(3)
    expect(result?.gradedCharacterCount).toBe(2)
    expect(result?.overallScoreSource).toBe('overall-aggregate-grade-v4')
    expect(result?.overallGrade).toBe(scoreToFineGrade(result?.overallPerformanceScore ?? 0))
  })

  it('keeps aggregate calibration cuts available for diagnostics only', () => {
    expect(scoreToAggregateGrade(100, 'character')).toBe('S+')
    expect(scoreToAggregateGrade(100, 'overall')).toBe('S+')
    expect(scoreToAggregateGrade(null, 'character')).toBeNull()
    expect(scoreToSharedFineAggregateGrade(100)).toBe('S+')
    expect(scoreToSharedFineAggregateGrade(null)).toBeNull()
  })

  it('does not promote A-range adjusted scores to S+ through aggregate calibration', () => {
    const result = computeOverallAggregateGradeV2({
      entries: Array.from({ length: 20 }, () => ({ score: 80, role: '스증 딜러' as const })),
      gradedCharacterCount: 1,
    })

    expect(result?.overallPerformanceScore).toBe(80)
    expect(result?.overallGrade).toBe(scoreToFineGrade(result?.overallPerformanceScore ?? 0))
    expect(result?.overallGrade).not.toMatch(/^S/)
  })
})
