import { describe, expect, it } from 'vitest'

import {
  createCollectorApiRequestMetrics,
  recordApiRequest,
  validateApiRequestMetrics,
} from './apiMetrics.js'
import { buildCostMetrics, createCollectorRunMetrics } from './metrics.js'

describe('collector api metrics', () => {
  it('카테고리 합계가 total과 일치한다', () => {
    const metrics = createCollectorApiRequestMetrics()
    recordApiRequest(metrics, 'gameDetail', 3)
    recordApiRequest(metrics, 'identityNicknameResolve', 2)
    recordApiRequest(metrics, 'identityGameVerification', 4)
    recordApiRequest(metrics, 'userGames', 1)
    expect(validateApiRequestMetrics(metrics)).toBe(true)
    expect(metrics.total).toBe(10)
  })
})

describe('collector cost metrics', () => {
  it('분모 0이면 null을 반환한다', () => {
    const metrics = createCollectorRunMetrics(0)
    const costs = buildCostMetrics(metrics)
    expect(costs.identityApiRequestsPerResolvedIdentity).toBeNull()
    expect(costs.totalApiRequestsPerNewUser).toBeNull()
  })

  it('작업별 API 비용을 분리 계산한다', () => {
    const metrics = createCollectorRunMetrics(0)
    metrics.api.identityNicknameResolve = 3
    metrics.api.identityGameVerification = 7
    metrics.api.gameDetail = 20
    metrics.api.userGames = 5
    metrics.api.total = 35
    metrics.identityQueueResolved = 5
    metrics.newGameDetailsCollected = 10
    metrics.newGamesDiscovered = 8
    const costs = buildCostMetrics(metrics)
    expect(costs.identityApiRequestsPerResolvedIdentity).toBe(2)
    expect(costs.gameDetailApiRequestsPerNewGame).toBe(2)
    expect(costs.userGameApiRequestsPerDiscoveredGame).toBe(0.625)
  })
})
