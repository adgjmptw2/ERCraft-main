import { describe, expect, it } from 'vitest'

import {
  ROLE_PRESET_WEIGHTS,
  sumRoleWeights,
  scoreToFineGrade,
  applySampleConfidence,
  resolveGradeConfidence,
  sampleConfidenceFactor,
} from './config.js'

describe('characterPerformanceGrade config', () => {
  it('역할별 가중치 합계는 100', () => {
    for (const role of Object.keys(ROLE_PRESET_WEIGHTS) as Array<keyof typeof ROLE_PRESET_WEIGHTS>) {
      expect(sumRoleWeights(role)).toBe(100)
    }
  })

  it('탱커·서포터 동물 킬 가중치', () => {
    expect(ROLE_PRESET_WEIGHTS['탱커'].monsterKill).toBe(7)
    expect(ROLE_PRESET_WEIGHTS['서포터'].monsterKill).toBe(3)
  })

  it('탱커·서포터 변경 가중치', () => {
    expect(ROLE_PRESET_WEIGHTS['탱커']).toMatchObject({
      damageToPlayer: 8,
      playerKill: 4,
      teamKill: 21,
      playerAssistant: 19,
      survival: 26,
      viewContribution: 15,
      monsterKill: 7,
    })
    expect(ROLE_PRESET_WEIGHTS['서포터']).toMatchObject({
      damageToPlayer: 5,
      playerKill: 3,
      teamKill: 22,
      playerAssistant: 28,
      survival: 19,
      viewContribution: 20,
      monsterKill: 3,
    })
  })

  it('등급 컷', () => {
    expect(scoreToFineGrade(95)).toBe('S+')
    expect(scoreToFineGrade(88)).toBe('S')
    expect(scoreToFineGrade(65)).toBe('B')
    expect(scoreToFineGrade(23)).toBe('D-')
  })

  it('표본 신뢰도 보정', () => {
    expect(sampleConfidenceFactor(5)).toBeCloseTo(5 / 6, 5)
    expect(sampleConfidenceFactor(10)).toBeCloseTo(10 / 11, 5)
    expect(sampleConfidenceFactor(18)).toBeCloseTo(18 / 19, 5)
    expect(sampleConfidenceFactor(19)).toBeCloseTo(19 / 20, 5)
    expect(sampleConfidenceFactor(20)).toBe(1)
    expect(sampleConfidenceFactor(30)).toBe(1)
    expect(applySampleConfidence(73.06, 18)).toBeCloseTo(72.6358, 4)
    expect(applySampleConfidence(73.06, 20)).toBeCloseTo(73.06, 5)
    expect(applySampleConfidence(85, 10)).toBeCloseTo(83.181818, 5)
    expect(applySampleConfidence(45, 10)).toBeCloseTo(46.818182, 5)
    expect(resolveGradeConfidence(4)).toBe('insufficient')
    expect(resolveGradeConfidence(8)).toBe('provisional')
    expect(resolveGradeConfidence(40)).toBe('high')
  })
})
