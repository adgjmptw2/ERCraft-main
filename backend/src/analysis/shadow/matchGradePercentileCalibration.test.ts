import { describe, expect, it } from 'vitest'

import {
  computePercentileBaseScore,
  empiricalPercentileMidrank,
  evaluatePercentileCalibrationCandidate,
  gateThresholdFromProductionRatio,
  percentilePlacementAdjustment,
} from './matchGradePercentileCalibration.js'
import { isOutcomeCapEvaluationMode } from './matchGradeOutcomeCap.js'

const thresholds = {
  sFamily: 0.7,
  s: 0.85,
  sPlus: 0.95,
}

describe('match grade percentile calibration shadow', () => {
  it('holdout percentile is computed from calibration values with mid-rank ties', () => {
    const calibrationResiduals = [-10, 0, 0, 20]
    expect(empiricalPercentileMidrank(calibrationResiduals, 0)).toBeCloseTo(0.5)
    expect(empiricalPercentileMidrank(calibrationResiduals, 20)).toBe(1)
  })

  it('residual이 증가하면 baseScore가 감소하지 않는다', () => {
    const targetScores = [10, 40, 60, 80, 100]
    const low = computePercentileBaseScore({ targetProductionScores: targetScores, residualPercentile: 0.25 })
    const high = computePercentileBaseScore({ targetProductionScores: targetScores, residualPercentile: 0.75 })
    expect(high).toBeGreaterThanOrEqual(low ?? 0)
  })

  it('P4/P6 순위 보정 절댓값이 지정 범위를 넘지 않는다', () => {
    expect(Math.abs(percentilePlacementAdjustment('P4', 1) ?? 0)).toBe(4)
    expect(Math.abs(percentilePlacementAdjustment('P4', 8) ?? 0)).toBe(4)
    expect(Math.abs(percentilePlacementAdjustment('P6', 1) ?? 0)).toBe(6)
    expect(Math.abs(percentilePlacementAdjustment('P6', 8) ?? 0)).toBe(6)
  })

  it('S+는 점수, residual percentile gate, placement 1~3을 모두 만족해야 한다', () => {
    const allowed = evaluatePercentileCalibrationCandidate({
      candidate: 'P6',
      input: { baseScore: 95, residualPercentile: 0.98, placement: 1 },
      thresholds,
    })
    expect(allowed?.grade).toBe('S+')

    const lowPercentile = evaluatePercentileCalibrationCandidate({
      candidate: 'P6',
      input: { baseScore: 95, residualPercentile: 0.94, placement: 1 },
      thresholds,
    })
    expect(lowPercentile?.grade).toBe('S')

    const lowPlacement = evaluatePercentileCalibrationCandidate({
      candidate: 'P6',
      input: { baseScore: 100, residualPercentile: 0.99, placement: 4 },
      thresholds,
    })
    expect(lowPlacement?.grade).toBe('S')
  })

  it('낮은 residual은 순위 보정만으로 S-family gate를 통과하지 못한다', () => {
    const result = evaluatePercentileCalibrationCandidate({
      candidate: 'P6',
      input: { baseScore: 90, residualPercentile: 0.3, placement: 1 },
      thresholds,
    })
    expect(result?.score).toBe(96)
    expect(result?.grade).toBe('A+')
  })

  it('누락 순위는 0으로 대체하지 않는다', () => {
    const result = evaluatePercentileCalibrationCandidate({
      candidate: 'P4',
      input: { baseScore: 80, residualPercentile: 0.8, placement: 0 },
      thresholds,
    })
    expect(result).toBeNull()
  })

  it('production grade 비율을 residual percentile gate로 변환한다', () => {
    expect(gateThresholdFromProductionRatio(0.14)).toBe(0.86)
    expect(gateThresholdFromProductionRatio(1.5)).toBe(0)
  })

  it('코발트는 shadow 평가 대상에서 제외한다', () => {
    expect(isOutcomeCapEvaluationMode('rank')).toBe(true)
    expect(isOutcomeCapEvaluationMode('cobalt')).toBe(false)
  })
})
