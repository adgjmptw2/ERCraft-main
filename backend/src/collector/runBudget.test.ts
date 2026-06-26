import { describe, expect, it } from 'vitest'

import { loadCollectorConfig } from './config.js'
import { resolveEffectiveBudgetPercents } from './backlogPolicy.js'
import { CollectorRunBudget } from './runBudget.js'

describe('collector config validation', () => {
  it('loads backlog and work iteration defaults', () => {
    const config = loadCollectorConfig({ workerId: 'test' })
    expect(config.maxWorkIterationsMultiplier).toBe(20)
    expect(config.priorityRefreshBatchSize).toBe(500)
    expect(config.identityBacklogSoftEnter).toBe(5000)
    expect(config.identityBacklogHardEnter).toBe(15000)
  })
})

describe('backlog policy', () => {
  const config = loadCollectorConfig({ workerId: 'backlog-test' })

  it('soft limit에서 identity 비율이 올라간다', () => {
    const percents = resolveEffectiveBudgetPercents(config, 6000, 'normal')
    expect(percents.stage).toBe('soft')
    expect(percents.identity).toBe(40)
    expect(percents.game).toBe(35)
  })

  it('hard limit에서 identity 비율이 더 올라간다', () => {
    const percents = resolveEffectiveBudgetPercents(config, 16000, 'soft')
    expect(percents.stage).toBe('hard')
    expect(percents.identity).toBe(55)
    expect(percents.game).toBe(20)
  })

  it('hysteresis로 soft 해제 시 normal로 복귀한다', () => {
    const percents = resolveEffectiveBudgetPercents(config, 3500, 'soft')
    expect(percents.stage).toBe('normal')
  })
})

describe('CollectorRunBudget', () => {
  const config = loadCollectorConfig({ workerId: 'test-budget' })

  it('game 큐 소진 후 identity/user가 잔여 API 예산을 사용한다', () => {
    const percents = resolveEffectiveBudgetPercents(config, 100, 'normal')
    const budget = new CollectorRunBudget(500, percents)
    for (let index = 0; index < 137; index += 1) budget.recordApi('game')
    const pick = budget.selectNextWork({ game: false, identity: true, user: true })
    expect(pick).toBe('identity')
    expect(budget.canSpendApi('identity', { game: false, identity: true, user: true })).toBe(true)
  })

  it('identity만 있을 때 identity 작업을 선택한다', () => {
    const percents = resolveEffectiveBudgetPercents(config, 100, 'normal')
    const budget = new CollectorRunBudget(20, percents)
    const pick = budget.selectNextWork({ game: false, identity: true, user: false })
    expect(pick).toBe('identity')
  })

  it('최소 보장 후 활성 큐끼리 잔여 예산을 공유한다', () => {
    const percents = resolveEffectiveBudgetPercents(config, 100, 'normal')
    const budget = new CollectorRunBudget(100, percents)
    for (let index = 0; index < 50; index += 1) budget.recordApi('game')
    for (let index = 0; index < 25; index += 1) budget.recordApi('identity')
    for (let index = 0; index < 20; index += 1) budget.recordApi('user')
    expect(budget.canSpendApi('identity', { game: false, identity: true, user: true })).toBe(true)
    expect(budget.canSpendApi('user', { game: false, identity: true, user: true })).toBe(true)
    expect(budget.getApiUsed()).toBe(95)
  })

  it('API 한도에 도달하면 canSpendApiTotal이 false다', () => {
    const percents = resolveEffectiveBudgetPercents(config, 100, 'normal')
    const budget = new CollectorRunBudget(10, percents)
    for (let index = 0; index < 10; index += 1) budget.recordApi('game')
    expect(budget.canSpendApiTotal()).toBe(false)
  })
})
