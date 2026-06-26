import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSeasonAggregateRefreshQueueForTests,
  enqueueSeasonAggregateRefresh,
  isSeasonAggregateRefreshInFlight,
  SEASON_AGGREGATE_REFRESH_MIN_COOLDOWN_MS,
} from './seasonAggregateRefreshQueue.js'

function job(run = vi.fn(async () => {})) {
  return {
    userNum: 123,
    uid: 'uid-test',
    apiSeasonId: 20,
    displaySeasonId: 11,
    run,
  }
}

describe('seasonAggregateRefreshQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearSeasonAggregateRefreshQueueForTests()
  })

  afterEach(() => {
    clearSeasonAggregateRefreshQueueForTests()
    vi.useRealTimers()
  })

  it('같은 uid+season 중복 enqueue는 inflight dedupe', () => {
    const run = vi.fn(async () => {})

    const first = enqueueSeasonAggregateRefresh(job(run))
    const second = enqueueSeasonAggregateRefresh(job(run))

    expect(first.enqueued).toBe(true)
    expect(second.enqueued).toBe(false)
    expect(second.inFlight).toBe(true)
    expect(second.skipReason).toBe('in-flight')
    expect(isSeasonAggregateRefreshInFlight('uid-test', 20)).toBe(true)
  })

  it('최근 시작한 refresh는 cooldown 동안 다시 enqueue하지 않음', async () => {
    const run = vi.fn(async () => {})

    const first = enqueueSeasonAggregateRefresh(job(run))
    await vi.runAllTimersAsync()
    const second = enqueueSeasonAggregateRefresh(job(run))
    vi.advanceTimersByTime(SEASON_AGGREGATE_REFRESH_MIN_COOLDOWN_MS)
    const third = enqueueSeasonAggregateRefresh(job(run))

    expect(first.enqueued).toBe(true)
    expect(second.enqueued).toBe(false)
    expect(second.inFlight).toBe(false)
    expect(second.skipReason).toBe('recently-started')
    expect(third.enqueued).toBe(true)
  })

  it('background promise로 실행하고 실패해도 throw하지 않음', async () => {
    const logger = { warn: vi.fn() }
    const run = vi.fn(async () => {
      throw new Error('boom')
    })

    enqueueSeasonAggregateRefresh({ ...job(run), logger: logger as never })
    await vi.runAllTimersAsync()

    expect(run).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(isSeasonAggregateRefreshInFlight('uid-test', 20)).toBe(false)
  })
})
