import type { FastifyBaseLogger } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { logPlayerRouteMetrics } from './playerRouteMetrics.js'

describe('logPlayerRouteMetrics', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('records season aggregate QA fields in dev logs', () => {
    process.env.NODE_ENV = 'development'
    const info = vi.fn()
    const log = { info } as unknown as FastifyBaseLogger

    logPlayerRouteMetrics(log, '/players/:nickname/season-aggregate', 'TestPlayer', Date.now(), {
      aggregateCacheStatus: 'partial',
      aggregateSource: 'mixed',
      aggregateCharacterCount: 5,
      aggregateRpPointCount: 7,
      aggregateIsRefreshing: true,
      aggregateRefreshEnqueued: true,
      aggregateRefreshInFlight: true,
      aggregateRefreshReason: 'rp-series-insufficient',
      aggregateRefreshSkipped: false,
      aggregateRefreshSkipReason: undefined,
      aggregateRefreshMaxPages: 5,
      aggregateRefreshPagesCollected: 3,
      aggregateRefreshStoppedReason: 'max-pages',
      aggregateCoverageRatio: 0.42,
      aggregateCollectedGames: 42,
      aggregateOfficialSeasonGames: 100,
    })

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/players/:nickname/season-aggregate',
        nickname: 'TestPlayer',
        aggregateCacheStatus: 'partial',
        aggregateSource: 'mixed',
        aggregateCharacterCount: 5,
        aggregateRpPointCount: 7,
        aggregateIsRefreshing: true,
        aggregateRefreshEnqueued: true,
        aggregateRefreshInFlight: true,
        aggregateRefreshReason: 'rp-series-insufficient',
        aggregateRefreshSkipped: false,
        aggregateRefreshMaxPages: 5,
        aggregateRefreshPagesCollected: 3,
        aggregateRefreshStoppedReason: 'max-pages',
        aggregateCoverageRatio: 0.42,
        aggregateCollectedGames: 42,
        aggregateOfficialSeasonGames: 100,
      }),
      'player route',
    )
  })
})
