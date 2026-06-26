import { describe, expect, it } from 'vitest'

import { loadCollectorConfig } from './config.js'
import {
  applyCapRiseLimit,
  applyObservationToState,
  isValidBalancedObservation,
  ratesFromObservation,
  type BalancedRunObservation,
} from './balancedObservationStore.js'

function sampleObservation(overrides: Partial<BalancedRunObservation> = {}): BalancedRunObservation {
  return {
    gameApiRequests: 5,
    userApiRequests: 0,
    identityApiRequests: 275,
    maintenanceApiRequests: 2,
    identitiesAddedFromGameDetail: 111,
    identitiesAddedFromUserDiscovery: 0,
    identitiesAddedFromManualSeed: 0,
    identitiesAddedFromRepair: 0,
    identitiesAddedFromOther: 0,
    identitiesProcessed: 187,
    pendingBefore: 12000,
    pendingAfter: 11900,
    totalApiRequests: 287,
    dryRun: false,
    fatalError: false,
    mode: 'balanced',
    modeSource: 'auto',
    apiMetricsValid: true,
    ...overrides,
  }
}

describe('balancedObservationStore', () => {
  const config = loadCollectorConfig({ workerId: 'obs-test' })

  it('uses actual API denominators for unit costs', () => {
    const rates = ratesFromObservation(sampleObservation())
    expect(rates.identitiesAddedPerGameApi).toBeCloseTo(111 / 5)
    expect(rates.identitiesAddedPerUserApi).toBeNull()
    expect(rates.identitiesProcessedPerIdentityApi).toBeCloseTo(187 / 275)
  })

  it('rejects dry-run and override observations', () => {
    expect(isValidBalancedObservation(sampleObservation({ dryRun: true }))).toBe(false)
    expect(isValidBalancedObservation(sampleObservation({ modeSource: 'override' }))).toBe(false)
    expect(isValidBalancedObservation(sampleObservation({ apiMetricsValid: false }))).toBe(false)
  })

  it('rejects API category mismatch', () => {
    expect(
      isValidBalancedObservation(sampleObservation({ maintenanceApiRequests: 10, totalApiRequests: 287 })),
    ).toBe(false)
  })

  it('returns zero user rate when user API was used but enqueue was zero', () => {
    const rates = ratesFromObservation(
      sampleObservation({ userApiRequests: 5, identitiesAddedFromUserDiscovery: 0 }),
    )
    expect(rates.identitiesAddedPerUserApi).toBe(0)
  })

  it('skips EWMA update when API denominator is zero', () => {
    const state = applyObservationToState(
      {
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
        sampleCount: 2,
        ewmaIdentitiesAddedPerGameApi: 10,
        ewmaIdentitiesAddedPerUserApi: 0.5,
        ewmaIdentitiesProcessedPerIdentityApi: 0.4,
        lastSafeGameCapPercent: 1,
        lastSafeUserCapPercent: 1,
        lastObservation: null,
      },
      sampleObservation({ userApiRequests: 0, identitiesAddedFromUserDiscovery: 0 }),
      config,
    )
    expect(state.ewmaIdentitiesAddedPerUserApi).toBe(0.5)
    expect(state.ewmaIdentitiesAddedPerGameApi).toBeCloseTo(10 * 0.75 + (111 / 5) * 0.25)
  })

  it('updates EWMA with alpha', () => {
    const state = applyObservationToState(
      {
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
        sampleCount: 0,
        ewmaIdentitiesAddedPerGameApi: 10,
        ewmaIdentitiesAddedPerUserApi: 0,
        ewmaIdentitiesProcessedPerIdentityApi: 0.5,
        lastSafeGameCapPercent: 1,
        lastSafeUserCapPercent: 1,
        lastObservation: null,
      },
      sampleObservation(),
      config,
    )
    expect(state.sampleCount).toBe(1)
    expect(state.ewmaIdentitiesAddedPerGameApi).toBeCloseTo(10 * 0.75 + (111 / 5) * 0.25)
  })

  it('limits cap rise to max increase per run', () => {
    expect(applyCapRiseLimit(1, 8, 1, true)).toBe(2)
    expect(applyCapRiseLimit(1, 8, 1, false)).toBe(8)
    expect(applyCapRiseLimit(5, 3, 1, true)).toBe(3)
  })
})
