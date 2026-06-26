import { describe, expect, it } from 'vitest'

import { formatParticipantTierRpLine } from '@/utils/participantTierRp'

describe('formatParticipantTierRpLine', () => {
  it('tier와 RP가 모두 있으면 함께 표시한다', () => {
    expect(formatParticipantTierRpLine(4105)).toMatch(/· 4,105 RP$/)
    expect(formatParticipantTierRpLine(4105).length).toBeGreaterThan('4,105 RP'.length)
  })

  it('RP가 있으면 tier와 함께 RP를 표시한다', () => {
    const line = formatParticipantTierRpLine(1500)
    expect(line).toMatch(/· 1,500 RP$/)
    expect(line.length).toBeGreaterThan('1,500 RP'.length)
  })

  it('데이터가 없으면 fallback을 표시한다', () => {
    expect(formatParticipantTierRpLine(null)).toBe('—')
    expect(formatParticipantTierRpLine(0)).toBe('—')
    expect(formatParticipantTierRpLine(undefined)).toBe('—')
  })
})
