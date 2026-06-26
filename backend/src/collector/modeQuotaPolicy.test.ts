import { describe, expect, it } from 'vitest'

import { loadCollectorConfig } from './config.js'
import { MODE_BUDGET_PERCENTS } from './operationMode.js'
import {
  buildModeQuotaPolicy,
  createQuotaMetrics,
  isApiKindBlocked,
} from './modeQuotaPolicy.js'
import { CollectorRunBudget } from './runBudget.js'

describe('modeQuotaPolicy', () => {
  const config = loadCollectorConfig({ workerId: 'quota-test' })

  it('drain caps game/user API at configured percent', () => {
    const policy = buildModeQuotaPolicy('drain', config, 500)
    expect(policy.apiCaps.game).toBe(25)
    expect(policy.apiCaps.user).toBe(25)
    expect(policy.overflowPriority[0]).toBe('identity')
    expect(policy.userOnlyWhenIdentityEmpty).toBe(true)
  })

  it('emergency blocks game and user API kinds', () => {
    const policy = buildModeQuotaPolicy('emergency-drain', config, 100)
    expect(isApiKindBlocked(policy, 'game')).toBe(true)
    expect(isApiKindBlocked(policy, 'user')).toBe(true)
    expect(policy.overflowPriority).toEqual(['identity', 'maintenance'])
  })
})

describe('drain quota scheduler', () => {
  const config = loadCollectorConfig({ workerId: 'drain-budget' })

  it('game 큐 비었을 때 user cap 초과 없이 identity 우선 소비', () => {
    const percents = {
      ...MODE_BUDGET_PERCENTS.drain,
      stage: 'hard' as const,
      pendingIdentities: 12_000,
      operationMode: 'drain' as const,
    }
    const quotaMetrics = createQuotaMetrics()
    const policy = buildModeQuotaPolicy('drain', config, 500)
    const budget = new CollectorRunBudget(500, percents, policy, quotaMetrics)
    const queues = { game: false, identity: true, user: true }

    for (let index = 0; index < 25; index += 1) budget.recordApi('user')
    expect(budget.canSpendApi('user', queues)).toBe(false)
    expect(budget.selectNextWork(queues)).toBe('identity')

    for (let index = 0; index < 450; index += 1) budget.recordApi('identity')
    const snapshot = budget.snapshot(queues)
    expect(snapshot.apiUserUsed).toBeLessThanOrEqual(25)
    expect(snapshot.apiGameUsed).toBeLessThanOrEqual(25)
    expect(snapshot.apiIdentityUsed + snapshot.apiMaintenanceUsed).toBeGreaterThanOrEqual(450)
  })

  it('identity runnable이면 user overflow를 선택하지 않는다', () => {
    const percents = {
      ...MODE_BUDGET_PERCENTS.drain,
      stage: 'hard' as const,
      pendingIdentities: 12_000,
      operationMode: 'drain' as const,
    }
    const policy = buildModeQuotaPolicy('drain', config, 500)
    const budget = new CollectorRunBudget(500, percents, policy, createQuotaMetrics())
    const queues = { game: false, identity: true, user: true }

    for (let index = 0; index < 425; index += 1) budget.recordApi('identity')
    for (let index = 0; index < 25; index += 1) budget.recordApi('user')

    expect(budget.selectNextWork(queues)).toBe('identity')
  })

  it('DB-only 작업은 API cap을 소모하지 않는다', () => {
    const percents = {
      ...MODE_BUDGET_PERCENTS.drain,
      stage: 'hard' as const,
      pendingIdentities: 12_000,
      operationMode: 'drain' as const,
    }
    const policy = buildModeQuotaPolicy('drain', config, 500)
    const budget = new CollectorRunBudget(500, percents, policy, createQuotaMetrics())
    expect(budget.getApiUsed()).toBe(0)
    expect(budget.atApiCap('user')).toBe(false)
  })
})
