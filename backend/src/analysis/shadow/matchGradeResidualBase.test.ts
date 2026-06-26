import { describe, expect, it } from 'vitest'

import {
  computeResidualBaseScore,
  computeRobustZ,
  evaluateResidualBaseCandidate,
  type RobustScaleStats,
} from './matchGradeResidualBase.js'

const robustStats: RobustScaleStats = {
  median: 0,
  mad: 5,
  iqr: 8,
  scale: 7.413,
  scaleSource: 'mad',
  safeMinimum: 1,
}

const thresholds = {
  robustZP70: 0.5,
  robustZP95: 1.7,
}

describe('match grade residual base shadow', () => {
  it('동일 residual에서는 높은 순위가 최대 ±6 범위에서만 유리하다', () => {
    const first = computeResidualBaseScore({
      candidate: 'R10',
      input: { roleResidual: 0, placement: 1, robustStats, gradeCenter: 65 },
    })
    const eighth = computeResidualBaseScore({
      candidate: 'R10',
      input: { roleResidual: 0, placement: 8, robustStats, gradeCenter: 65 },
    })
    expect(first?.score).toBe(71)
    expect(eighth?.score).toBe(59)
  })

  it('같은 순위에서는 높은 residual이 항상 높은 점수다', () => {
    const low = computeResidualBaseScore({
      candidate: 'R10',
      input: { roleResidual: -10, placement: 4, robustStats, gradeCenter: 65 },
    })
    const high = computeResidualBaseScore({
      candidate: 'R10',
      input: { roleResidual: 10, placement: 4, robustStats, gradeCenter: 65 },
    })
    expect(high?.score).toBeGreaterThan(low?.score ?? 0)
  })

  it('낮은 residual 1등이 높은 residual 8등을 무조건 이기지 않는다', () => {
    const lowFirst = computeResidualBaseScore({
      candidate: 'R12',
      input: { roleResidual: -10, placement: 1, robustStats, gradeCenter: 65 },
    })
    const highEighth = computeResidualBaseScore({
      candidate: 'R12',
      input: { roleResidual: 20, placement: 8, robustStats, gradeCenter: 65 },
    })
    expect(highEighth?.score).toBeGreaterThan(lowFirst?.score ?? 0)
  })

  it('robust scale 누락값을 0으로 대체하지 않는다', () => {
    expect(
      computeRobustZ({
        roleResidual: 10,
        stats: { median: 0, mad: 0, iqr: 0, scale: null, scaleSource: 'unavailable', safeMinimum: 1 },
      }),
    ).toBeNull()
  })

  it('residual gate는 낮은 residual 1등의 S 계열을 막는다', () => {
    const result = evaluateResidualBaseCandidate({
      candidate: 'R12',
      input: { roleResidual: 25, placement: 1, robustStats, gradeCenter: 80 },
      thresholds,
      gateMode: 'residual-gate',
    })
    expect(result?.score).toBeGreaterThanOrEqual(95)
    expect(result?.grade).toBe('S+')

    const low = evaluateResidualBaseCandidate({
      candidate: 'R12',
      input: { roleResidual: 1, placement: 1, robustStats, gradeCenter: 90 },
      thresholds,
      gateMode: 'residual-gate',
    })
    expect(['A+', 'A', 'A-']).toContain(low?.grade)
  })

  it('7~8등은 residual gate에서 S/S+를 허용하지 않는다', () => {
    const result = evaluateResidualBaseCandidate({
      candidate: 'R12',
      input: { roleResidual: 50, placement: 8, robustStats, gradeCenter: 80 },
      thresholds,
      gateMode: 'residual-gate',
    })
    expect(result?.score).toBe(100)
    expect(['S+', 'S', 'S-']).not.toContain(result?.grade)
  })
})
