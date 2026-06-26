import { beforeEach, describe, expect, it } from 'vitest'

import { loadCollectorConfig } from './config.js'
import {
  computeIdentityProcessed,
  MODE_BUDGET_PERCENTS,
  resolveOperationMode,
  validateOperationModeThresholds,
  loadOperationModeThresholds,
} from './operationMode.js'
import { clearModeStateForTests } from './modeState.js'

describe('operationMode', () => {
  beforeEach(() => {
    clearModeStateForTests()
  })

  it('selects drain at ~13k pending with no recent stats', () => {
    const config = loadCollectorConfig({ workerId: 'test' })
    const result = resolveOperationMode(
      config,
      { pendingIdentities: 12_987 },
      'auto',
    )
    expect(result.mode).toBe('drain')
    expect(result.effectivePercents.identity).toBe(85)
    expect(result.suppressIdentityEnqueueFromGames).toBe(true)
  })

  it('emergency override blocks game and user API', () => {
    const config = loadCollectorConfig({ workerId: 'test' })
    const result = resolveOperationMode(
      config,
      { pendingIdentities: 1000 },
      'override',
      'emergency-drain',
    )
    expect(result.blockGameApi).toBe(true)
    expect(result.blockUserApi).toBe(true)
    expect(result.effectivePercents.game).toBe(0)
    expect(result.effectivePercents.user).toBe(0)
  })

  it('rejects invalid threshold ordering', () => {
    expect(() =>
      validateOperationModeThresholds({
        ...loadOperationModeThresholds(loadCollectorConfig({ workerId: 'test' })),
        drainExit: 12_000,
      }),
    ).toThrow()
  })

  it('computes identityProcessed without retry', () => {
    expect(
      computeIdentityProcessed({
        resolved: 10,
        mismatch: 2,
        outOfWindow: 1,
        ambiguous: 1,
        deferredOldSource: 3,
      }),
    ).toBe(17)
  })

  it('mode budgets sum to 100', () => {
    for (const percents of Object.values(MODE_BUDGET_PERCENTS)) {
      expect(percents.game + percents.identity + percents.user + percents.maintenance).toBe(100)
    }
  })

  it('steps emergency down to drain before balanced', () => {
    const config = loadCollectorConfig({ workerId: 'test' })
    const result = resolveOperationMode(
      config,
      {
        pendingIdentities: 13_500,
        previousState: {
          lastMode: 'emergency-drain',
          modeEnteredAt: new Date(Date.now() - 600_000).toISOString(),
          lastIdentityPending: 21_000,
          lastIdentityAdded: 0,
          lastIdentityProcessed: 500,
          lastRunFinishedAt: null,
        },
      },
      'auto',
    )
    expect(result.mode).toBe('drain')
    expect(result.reason).toContain('hysteresis-step-down')
  })

  it('does not jump drain directly to expansion', () => {
    const config = loadCollectorConfig({ workerId: 'test' })
    const result = resolveOperationMode(
      config,
      {
        pendingIdentities: 3_000,
        previousState: {
          lastMode: 'drain',
          modeEnteredAt: new Date(Date.now() - 600_000).toISOString(),
          lastIdentityPending: 8_000,
          lastIdentityAdded: 0,
          lastIdentityProcessed: 400,
          lastRunFinishedAt: null,
        },
      },
      'auto',
    )
    expect(result.mode).toBe('balanced')
  })
})
