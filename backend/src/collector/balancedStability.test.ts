import { describe, expect, it } from 'vitest'

import { loadCollectorConfig } from './config.js'
import { computeBalancedStability, estimatesFromRunMetrics, resolveBalancedStability } from './balancedStability.js'

describe('balancedStability', () => {
  const config = loadCollectorConfig({ workerId: 'balanced-test' })

  it('returns null rates when API denominators are zero', () => {
    const rates = estimatesFromRunMetrics({
      gameApi: 0,
      userApi: 0,
      identityApi: 0,
      identitiesAddedFromGameDetail: 10,
      identitiesAddedFromUserDiscovery: 5,
      identityProcessed: 100,
    })
    expect(rates.identitiesAddedPerGameApi).toBeNull()
    expect(rates.identitiesAddedPerUserApi).toBeNull()
    expect(rates.identitiesProcessedPerIdentityApi).toBeNull()
  })

  it('returns zero user rate when user API was used without enqueue', () => {
    const rates = estimatesFromRunMetrics({
      gameApi: 10,
      userApi: 5,
      identityApi: 100,
      identitiesAddedFromGameDetail: 20,
      identitiesAddedFromUserDiscovery: 0,
      identityProcessed: 50,
    })
    expect(rates.identitiesAddedPerUserApi).toBe(0)
    expect(rates.identitiesAddedPerGameApi).toBe(2)
  })

  it('reduces game/user caps when projected inflow exceeds processed capacity', () => {
    const result = computeBalancedStability(config, 500, {
      identitiesAddedPerGameApi: 2,
      identitiesAddedPerUserApi: 0.5,
      identitiesProcessedPerIdentityApi: 0.4,
    })
    expect(result.effectiveApiCaps.game).toBeLessThanOrEqual(125)
    expect(result.effectiveApiCaps.user).toBeLessThanOrEqual(75)
    expect(result.effectivePercents.identity).toBeGreaterThanOrEqual(config.balancedMinIdentityPercent)
    expect(result.reason).toBe('projected-inflow-too-high')
  })

  it('keeps configured balanced caps when stable', () => {
    const result = computeBalancedStability(config, 500, {
      identitiesAddedPerGameApi: 0.1,
      identitiesAddedPerUserApi: 0.05,
      identitiesProcessedPerIdentityApi: 1.5,
    })
    expect(result.stable).toBe(true)
    expect(result.effectiveApiCaps.game).toBe(125)
    expect(result.effectiveApiCaps.user).toBe(75)
  })

  it('uses fallback caps when observations are insufficient', () => {
    const result = resolveBalancedStability(config, 500, null)
    expect(result.capReason).toBe('insufficient-observations-fallback')
    expect(result.effectiveApiCaps.game).toBeLessThanOrEqual(5)
    expect(result.effectiveApiCaps.user).toBeLessThanOrEqual(5)
  })

  it('limits cap rise per run when observations exist', () => {
    const result = resolveBalancedStability(config, 500, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sampleCount: 5,
      ewmaIdentitiesAddedPerGameApi: 0.1,
      ewmaIdentitiesAddedPerUserApi: 0.05,
      ewmaIdentitiesProcessedPerIdentityApi: 1.5,
      lastSafeGameCapPercent: 1,
      lastSafeUserCapPercent: 1,
      lastObservation: null,
    })
    expect(result.effectiveApiCaps.game).toBeLessThanOrEqual(10)
    expect(result.capReason).not.toBe('configured-balanced')
  })
})
