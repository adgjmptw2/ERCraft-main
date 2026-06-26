import { describe, expect, it } from 'vitest'

import { loadCollectorConfig } from './config.js'
import { resolveOperationMode, MODE_BUDGET_PERCENTS } from './operationMode.js'
import { CollectorRunBudget } from './runBudget.js'
import { collectorUsableDailyBudget } from './config.js'

describe('collector long-run simulation', () => {
  const config = loadCollectorConfig({ workerId: 'sim' })

  it('12,987 pending selects drain mode in auto', () => {
    const mode = resolveOperationMode(config, { pendingIdentities: 12_987 }, 'auto')
    expect(mode.mode).toBe('drain')
    expect(mode.effectivePercents.game).toBe(5)
  })

  it('emergency drain scheduler uses zero game/user minimums', () => {
    const percents = {
      ...MODE_BUDGET_PERCENTS['emergency-drain'],
      stage: 'hard' as const,
      pendingIdentities: 20_000,
      operationMode: 'emergency-drain' as const,
    }
    const budget = new CollectorRunBudget(500, percents)
    const snapshot = budget.snapshot({ game: true, identity: true, user: true })
    expect(snapshot.gameMinimum).toBe(0)
    expect(snapshot.userMinimum).toBe(0)
    expect(snapshot.identityMinimum).toBe(475)
  })

  it('24h mock simulation drains backlog when expansion is suppressed', () => {
    const usableDaily = collectorUsableDailyBudget(config)
    const hours = 24
    const requestsPerHour = Math.floor(usableDaily / hours)
    let pending = 13_000
    let modeHours = { expansion: 0, balanced: 0, drain: 0, emergency: 0 }
    const identitiesPerGame = 22
    const resolvedPerIdentityApi = 2.19
    const identityApiShare = 0.85

    for (let hour = 0; hour < hours; hour += 1) {
      const mode = resolveOperationMode(config, { pendingIdentities: pending }, 'auto')
      modeHours[mode.mode === 'emergency-drain' ? 'emergency' : mode.mode] += 1

      const identityApi = Math.floor(requestsPerHour * identityApiShare)
      const processed = Math.floor(identityApi * resolvedPerIdentityApi)
      const gameApi = mode.mode === 'drain' ? Math.floor(requestsPerHour * 0.05) : Math.floor(requestsPerHour * 0.5)
      const added = mode.suppressIdentityEnqueueFromGames ? 0 : gameApi * identitiesPerGame

      pending = Math.max(0, pending + added - processed)
    }

    expect(pending).toBeLessThan(13_000)
    expect(modeHours.drain + modeHours.emergency).toBeGreaterThan(modeHours.expansion)
  })

  it('hysteresis keeps emergency until exit threshold', () => {
    const entered = resolveOperationMode(
      config,
      { pendingIdentities: 21_000 },
      'auto',
      undefined,
    )
    expect(entered.mode).toBe('emergency-drain')
    const hold = resolveOperationMode(
      config,
      {
        pendingIdentities: 14_500,
        previousState: {
          lastMode: 'emergency-drain',
          modeEnteredAt: new Date().toISOString(),
          lastIdentityPending: 21_000,
          lastIdentityAdded: 0,
          lastIdentityProcessed: 0,
          lastRunFinishedAt: null,
        },
      },
      'auto',
    )
    expect(hold.mode).toBe('emergency-drain')
  })
})
