import { describe, expect, it } from 'vitest'

import {
  computeOutcomeCapScore,
  evaluateOutcomeCapCandidate,
  isOutcomeCapEvaluationMode,
  placementAdjustment,
} from './matchGradeOutcomeCap.js'

describe('match grade outcome cap shadow', () => {
  it('동일 역할 수행 점수에서는 1등 점수가 8등보다 높다', () => {
    expect(computeOutcomeCapScore('A', { roleScore: 70, placement: 1 })).toBeGreaterThan(
      computeOutcomeCapScore('A', { roleScore: 70, placement: 8 }) ?? 0,
    )
  })

  it('순위 보정 차이가 후보별 최대 범위를 넘지 않는다', () => {
    expect(placementAdjustment('A', 1)).toBe(6)
    expect(placementAdjustment('A', 8)).toBe(-6)
    expect(placementAdjustment('B', 1)).toBe(8)
    expect(placementAdjustment('B', 8)).toBe(-8)
    expect(placementAdjustment('C', 1)).toBe(10)
    expect(placementAdjustment('C', 8)).toBe(-10)
  })

  it('0~100 clamp가 적용된다', () => {
    expect(computeOutcomeCapScore('C', { roleScore: 98, placement: 1 })).toBe(100)
    expect(computeOutcomeCapScore('C', { roleScore: 3, placement: 8 })).toBe(0)
  })

  it('높은 역할 수행 하위 순위가 낮은 수행 상위 순위를 추월할 수 있다', () => {
    const lowFirst = computeOutcomeCapScore('B', { roleScore: 55, placement: 1 })
    const highEighth = computeOutcomeCapScore('B', { roleScore: 80, placement: 8 })
    expect(highEighth).toBeGreaterThan(lowFirst ?? 0)
  })

  it('낮은 역할 수행의 1등이 순위만으로 S/S+가 되지 않는다', () => {
    const result = evaluateOutcomeCapCandidate({
      candidate: 'C',
      input: { roleScore: 78, placement: 1, outcomeScore: 100 },
      gateMode: 'v2-placement-guard',
    })
    expect(result?.score).toBe(88)
    expect(result?.grade).toBe('A+')
  })

  it('7~8등은 v2 placement guard에서 B+ 상한을 적용한다', () => {
    const result = evaluateOutcomeCapCandidate({
      candidate: 'C',
      input: { roleScore: 100, placement: 8, outcomeScore: 20 },
      gateMode: 'v2-placement-guard',
    })
    expect(result?.score).toBe(90)
    expect(result?.grade).toBe('B+')
  })

  it('순위 누락값은 0이나 중간값으로 처리하지 않는다', () => {
    expect(computeOutcomeCapScore('A', { roleScore: 70, placement: 0 })).toBeNull()
    expect(computeOutcomeCapScore('A', { roleScore: 70, placement: 9 })).toBeNull()
  })

  it('코발트는 shadow 평가 대상에서 제외한다', () => {
    expect(isOutcomeCapEvaluationMode('rank')).toBe(true)
    expect(isOutcomeCapEvaluationMode('cobalt')).toBe(false)
    expect(isOutcomeCapEvaluationMode('normal')).toBe(false)
  })
})
