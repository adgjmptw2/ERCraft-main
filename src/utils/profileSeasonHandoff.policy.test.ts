import { describe, expect, it } from 'vitest'

interface SeasonsHandoffInput {
  seasonsQueryBaseEnabled: boolean
  routeSummaryReady: boolean
  hasProfileCache: boolean
  hasStoredSeasonHistory: boolean
  currentSeasonForQuery: number
  pastSeasonsInitialReady: boolean
  currentSeasonsQuerySuccess: boolean
}

function fullRangeSeasonsEnabled(input: SeasonsHandoffInput): boolean {
  return (
    input.seasonsQueryBaseEnabled &&
    input.routeSummaryReady &&
    (input.hasProfileCache || input.hasStoredSeasonHistory) &&
    input.currentSeasonForQuery >= 1
  )
}

function pastSeasonsRangeEnabled(input: SeasonsHandoffInput): boolean {
  const full = fullRangeSeasonsEnabled(input)
  const pastSeasonsTo = Math.max(1, input.currentSeasonForQuery - 1)
  return (
    input.seasonsQueryBaseEnabled &&
    !full &&
    (input.hasProfileCache || input.hasStoredSeasonHistory || input.pastSeasonsInitialReady) &&
    (input.hasProfileCache || input.hasStoredSeasonHistory || input.currentSeasonsQuerySuccess) &&
    input.currentSeasonForQuery > 1 &&
    pastSeasonsTo >= 1
  )
}

function currentSeasonOnlyEnabled(input: SeasonsHandoffInput): boolean {
  return input.seasonsQueryBaseEnabled && !fullRangeSeasonsEnabled(input)
}

describe('profile seasons handoff policy (ProfilePage mirror)', () => {
  const base: SeasonsHandoffInput = {
    seasonsQueryBaseEnabled: true,
    routeSummaryReady: false,
    hasProfileCache: false,
    hasStoredSeasonHistory: false,
    currentSeasonForQuery: 11,
    pastSeasonsInitialReady: false,
    currentSeasonsQuerySuccess: false,
  }

  it('검색 직후 summary 미준비면 S11-only current query만 활성', () => {
    expect(currentSeasonOnlyEnabled(base)).toBe(true)
    expect(fullRangeSeasonsEnabled(base)).toBe(false)
    expect(pastSeasonsRangeEnabled(base)).toBe(false)
  })

  it('summary 도착 + cache 없음 + defer 미완이면 past seasons 비활성 → S11-only 고착 구간', () => {
    const afterSummary = {
      ...base,
      routeSummaryReady: true,
      pastSeasonsInitialReady: false,
      currentSeasonsQuerySuccess: true,
    }
    expect(pastSeasonsRangeEnabled(afterSummary)).toBe(false)
  })

  it('summary 도착 + defer 완료 + current success면 past seasons 활성', () => {
    const ready = {
      ...base,
      routeSummaryReady: true,
      pastSeasonsInitialReady: true,
      currentSeasonsQuerySuccess: true,
    }
    expect(pastSeasonsRangeEnabled(ready)).toBe(true)
  })

  it('hasProfileCache true + route ready면 full range 1~11 단일 query', () => {
    const cached = {
      ...base,
      routeSummaryReady: true,
      hasProfileCache: true,
    }
    expect(fullRangeSeasonsEnabled(cached)).toBe(true)
    expect(currentSeasonOnlyEnabled(cached)).toBe(false)
  })

  it('hasStoredSeasonHistory true면 full range 즉시 활성', () => {
    const stored = {
      ...base,
      routeSummaryReady: true,
      hasStoredSeasonHistory: true,
    }
    expect(fullRangeSeasonsEnabled(stored)).toBe(true)
    expect(pastSeasonsRangeEnabled(stored)).toBe(false)
  })
})
