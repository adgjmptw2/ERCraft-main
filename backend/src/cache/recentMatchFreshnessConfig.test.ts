import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RECENT_MATCH_FAILURE_COOLDOWN_MS,
  isRecentMatchCheckInCooldown,
  isRecentMatchCheckStale,
  resolveRecentMatchFailureCooldownMs,
} from './recentMatchFreshnessConfig.js'

describe('recentMatchFreshnessConfig backoff', () => {
  it('실패 cooldown 기본값은 5분', () => {
    expect(resolveRecentMatchFailureCooldownMs({})).toBe(DEFAULT_RECENT_MATCH_FAILURE_COOLDOWN_MS)
  })

  it('nextRetryAt 이전이면 cooldown', () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const nextRetryAt = new Date('2026-06-19T12:04:00Z')
    expect(isRecentMatchCheckInCooldown(nextRetryAt, now)).toBe(true)
  })

  it('nextRetryAt 만료 후 cooldown 해제', () => {
    const now = new Date('2026-06-19T12:06:00Z')
    const nextRetryAt = new Date('2026-06-19T12:05:00Z')
    expect(isRecentMatchCheckInCooldown(nextRetryAt, now)).toBe(false)
  })

  it('cooldown 중에도 lastCheckedAt stale이면 stale 판정은 유지', () => {
    const now = new Date('2026-06-19T12:00:00Z')
    const lastChecked = new Date('2026-06-18T12:00:00Z')
    expect(isRecentMatchCheckStale(lastChecked, now)).toBe(true)
  })
})
