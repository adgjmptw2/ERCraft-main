import { describe, expect, it } from 'vitest'

import { resolveFormalGrade } from './gradePolicy.js'

describe('gradePolicy', () => {
  it('blocks formal S+ for cohort 30-49 (tercile only)', () => {
    const result = resolveFormalGrade({
      percentile: 99,
      samplePlayers: 39,
      playerConfidence: 'official',
      comparisonMatched: true,
    })
    expect(result.grade).toBeNull()
    expect(result.gradeDisplay).toBe('상위권')
    expect(result.cohortConfidence).toBe('tercile')
  })

  it('blocks formal S+ for cohort 30 exactly', () => {
    const result = resolveFormalGrade({
      percentile: 99,
      samplePlayers: 30,
      playerConfidence: 'official',
      comparisonMatched: true,
    })
    expect(result.grade).toBeNull()
    expect(result.gradeDisplay).toBe('상위권')
  })

  it('allows formal grade for cohort 100+ official player', () => {
    const result = resolveFormalGrade({
      percentile: 99,
      samplePlayers: 124,
      playerConfidence: 'official',
      comparisonMatched: true,
    })
    expect(result.grade).toBe('S+')
    expect(result.gradeDisplay).toBe('S+')
  })

  it('blocks formal grade when comparison scope mismatched', () => {
    const result = resolveFormalGrade({
      percentile: 95,
      samplePlayers: 120,
      playerConfidence: 'official',
      comparisonMatched: false,
    })
    expect(result.grade).toBeNull()
    expect(result.comparisonUnavailableReason).toBe('matching-benchmark-unavailable')
  })

  it('cohort 29 disables comparison', () => {
    const result = resolveFormalGrade({
      percentile: 95,
      samplePlayers: 29,
      playerConfidence: 'official',
      comparisonMatched: true,
    })
    expect(result.grade).toBeNull()
    expect(result.percentileDisplay).toBe('비교 표본 부족')
  })

  it('cohort 74 uses decile band not letter grade', () => {
    const result = resolveFormalGrade({
      percentile: 87,
      samplePlayers: 74,
      playerConfidence: 'official',
      comparisonMatched: true,
    })
    expect(result.grade).toBeNull()
    expect(result.gradeDisplay).toMatch(/상위 \d0%대/)
  })
})