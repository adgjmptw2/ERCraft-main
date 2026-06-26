import type { CollectorConfig } from './config.js'
import { MODE_BUDGET_PERCENTS } from './operationMode.js'
import type { BalancedObservationState } from './balancedObservationStore.js'
import {
  FALLBACK_SAFE_GAME_CAP_PERCENT,
  FALLBACK_SAFE_USER_CAP_PERCENT,
  applyCapRiseLimit,
  capPercentFromApiCap,
  conservativeEstimatesFromState,
} from './balancedObservationStore.js'

export interface BalancedThroughputEstimates {
  identitiesAddedPerGameApi: number
  identitiesAddedPerUserApi: number
  identitiesProcessedPerIdentityApi: number
}

export interface BalancedThroughputRates {
  identitiesAddedPerGameApi: number | null
  identitiesAddedPerUserApi: number | null
  identitiesProcessedPerIdentityApi: number | null
}

export interface BalancedStabilityResult {
  configuredPercents: {
    game: number
    identity: number
    user: number
    maintenance: number
  }
  effectivePercents: {
    game: number
    identity: number
    user: number
    maintenance: number
  }
  effectiveApiCaps: {
    game: number
    user: number
  }
  projectedIdentityAdded: number
  projectedIdentityProcessed: number
  safetyFactor: number
  stable: boolean
  reason: string
  observationSampleCount: number
  observedAddedPerGameApi: number | null
  observedAddedPerUserApi: number | null
  observedProcessedPerIdentityApi: number | null
  previousSafeGameCap: number
  previousSafeUserCap: number
  calculatedGameCap: number
  calculatedUserCap: number
  effectiveGameCap: number
  effectiveUserCap: number
  effectiveIdentityPercent: number
  capReason: string
}

function apiCap(maxApiRequests: number, percent: number): number {
  return Math.max(0, Math.floor((maxApiRequests * percent) / 100))
}

export const DEFAULT_BALANCED_ESTIMATES: BalancedThroughputEstimates = {
  identitiesAddedPerGameApi: 0.35,
  identitiesAddedPerUserApi: 0.08,
  identitiesProcessedPerIdentityApi: 0.55,
}

export function estimatesFromRunMetrics(params: {
  gameApi: number
  userApi: number
  identityApi: number
  identitiesAddedFromGameDetail: number
  identitiesAddedFromUserDiscovery: number
  identityProcessed: number
}): BalancedThroughputRates {
  return {
    identitiesAddedPerGameApi:
      params.gameApi > 0 ? params.identitiesAddedFromGameDetail / params.gameApi : null,
    identitiesAddedPerUserApi:
      params.userApi > 0 ? params.identitiesAddedFromUserDiscovery / params.userApi : null,
    identitiesProcessedPerIdentityApi:
      params.identityApi > 0 ? params.identityProcessed / params.identityApi : null,
  }
}

export function computeBalancedStability(
  config: CollectorConfig,
  maxApiRequests: number,
  estimates: BalancedThroughputEstimates = DEFAULT_BALANCED_ESTIMATES,
  explicitSeedLimit = 0,
): BalancedStabilityResult {
  const configured = MODE_BUDGET_PERCENTS.balanced
  const safetyFactor = config.balancedStabilitySafetyFactor
  const configuredGameCap = apiCap(maxApiRequests, config.balancedGameApiMaxPercent)
  const configuredUserCap = apiCap(maxApiRequests, config.balancedUserApiMaxPercent)
  const configuredIdentityMin = apiCap(maxApiRequests, config.balancedMinIdentityPercent)
  const maintenanceCap = apiCap(maxApiRequests, configured.maintenance)

  const projectedAtConfigured =
    configuredGameCap * estimates.identitiesAddedPerGameApi +
    configuredUserCap * estimates.identitiesAddedPerUserApi +
    explicitSeedLimit
  const processedAtConfigured =
    Math.max(configuredIdentityMin, apiCap(maxApiRequests, configured.identity)) *
    estimates.identitiesProcessedPerIdentityApi

  let calculatedGameCap = configuredGameCap
  let calculatedUserCap = configuredUserCap
  let reason = 'configured-balanced'

  if (
    projectedAtConfigured > processedAtConfigured * safetyFactor &&
    (estimates.identitiesAddedPerGameApi > 0 || estimates.identitiesAddedPerUserApi > 0)
  ) {
    let gameCap = configuredGameCap
    let userCap = configuredUserCap
    while (gameCap > 0 || userCap > 0) {
      const projected =
        gameCap * estimates.identitiesAddedPerGameApi +
        userCap * estimates.identitiesAddedPerUserApi +
        explicitSeedLimit
      const identityBudget = Math.max(
        configuredIdentityMin,
        maxApiRequests - gameCap - userCap - maintenanceCap,
      )
      const processed = identityBudget * estimates.identitiesProcessedPerIdentityApi
      if (projected <= processed * safetyFactor) break
      if (gameCap >= userCap && gameCap > 0) gameCap -= 1
      else if (userCap > 0) userCap -= 1
      else break
    }
    calculatedGameCap = gameCap
    calculatedUserCap = userCap
    reason = 'projected-inflow-too-high'
  }

  return finalizeBalancedStability({
    config,
    maxApiRequests,
    configured,
    safetyFactor,
    configuredGameCap,
    configuredUserCap,
    configuredIdentityMin,
    maintenanceCap,
    calculatedGameCap,
    calculatedUserCap,
    effectiveGameCap: calculatedGameCap,
    effectiveUserCap: calculatedUserCap,
    estimates,
    explicitSeedLimit,
    reason,
    observationSampleCount: 0,
    observedAddedPerGameApi: null,
    observedAddedPerUserApi: null,
    observedProcessedPerIdentityApi: null,
    previousSafeGameCap: FALLBACK_SAFE_GAME_CAP_PERCENT,
    previousSafeUserCap: FALLBACK_SAFE_USER_CAP_PERCENT,
    capReason: reason,
  })
}

export function resolveBalancedStability(
  config: CollectorConfig,
  maxApiRequests: number,
  observationState: BalancedObservationState | null,
  options: {
    explicitSeedLimit?: number
    emergencyCapReduction?: boolean
  } = {},
): BalancedStabilityResult {
  const explicitSeedLimit = Math.max(0, options.explicitSeedLimit ?? 0)
  const previousSafeGameCap =
    observationState?.lastSafeGameCapPercent ?? FALLBACK_SAFE_GAME_CAP_PERCENT
  const previousSafeUserCap =
    observationState?.lastSafeUserCapPercent ?? FALLBACK_SAFE_USER_CAP_PERCENT
  const sampleCount = observationState?.sampleCount ?? 0
  const insufficient = sampleCount < config.balancedObservationMinSamples

  const estimates = conservativeEstimatesFromState(observationState, config)
  const observedAddedPerGameApi = observationState?.ewmaIdentitiesAddedPerGameApi ?? null
  const observedAddedPerUserApi = observationState?.ewmaIdentitiesAddedPerUserApi ?? null
  const observedProcessedPerIdentityApi =
    observationState?.ewmaIdentitiesProcessedPerIdentityApi ?? null

  if (insufficient) {
    const fallbackGameCap = apiCap(maxApiRequests, FALLBACK_SAFE_GAME_CAP_PERCENT)
    const fallbackUserCap = apiCap(maxApiRequests, FALLBACK_SAFE_USER_CAP_PERCENT)
    return finalizeBalancedStability({
      config,
      maxApiRequests,
      configured: MODE_BUDGET_PERCENTS.balanced,
      safetyFactor: config.balancedStabilitySafetyFactor,
      configuredGameCap: apiCap(maxApiRequests, config.balancedGameApiMaxPercent),
      configuredUserCap: apiCap(maxApiRequests, config.balancedUserApiMaxPercent),
      configuredIdentityMin: apiCap(maxApiRequests, config.balancedMinIdentityPercent),
      maintenanceCap: apiCap(maxApiRequests, MODE_BUDGET_PERCENTS.balanced.maintenance),
      calculatedGameCap: fallbackGameCap,
      calculatedUserCap: fallbackUserCap,
      effectiveGameCap: fallbackGameCap,
      effectiveUserCap: fallbackUserCap,
      estimates,
      explicitSeedLimit,
      reason: 'insufficient-observations-fallback',
      observationSampleCount: sampleCount,
      observedAddedPerGameApi,
      observedAddedPerUserApi,
      observedProcessedPerIdentityApi,
      previousSafeGameCap,
      previousSafeUserCap,
      capReason: 'insufficient-observations-fallback',
    })
  }

  const raw = computeBalancedStability(config, maxApiRequests, estimates, explicitSeedLimit)
  const calculatedGamePercent = capPercentFromApiCap(maxApiRequests, raw.calculatedGameCap)
  const calculatedUserPercent = capPercentFromApiCap(maxApiRequests, raw.calculatedUserCap)

  const allowIncrease = !options.emergencyCapReduction
  const cappedGamePercent = applyCapRiseLimit(
    previousSafeGameCap,
    calculatedGamePercent,
    config.balancedMaxCapIncreasePerRunPercent,
    allowIncrease,
  )
  const cappedUserPercent = applyCapRiseLimit(
    previousSafeUserCap,
    calculatedUserPercent,
    config.balancedMaxCapIncreasePerRunPercent,
    allowIncrease,
  )

  const effectiveGameCap = Math.min(
    apiCap(maxApiRequests, config.balancedGameApiMaxPercent),
    apiCap(maxApiRequests, cappedGamePercent),
  )
  const effectiveUserCap = Math.min(
    apiCap(maxApiRequests, config.balancedUserApiMaxPercent),
    apiCap(maxApiRequests, cappedUserPercent),
  )

  let capReason = raw.capReason
  if (options.emergencyCapReduction) capReason = 'emergency-cap-reduction'
  else if (cappedGamePercent < calculatedGamePercent || cappedUserPercent < calculatedUserPercent) {
    capReason = 'gradual-cap-increase'
  } else if (
    effectiveGameCap === apiCap(maxApiRequests, previousSafeGameCap) &&
    effectiveUserCap === apiCap(maxApiRequests, previousSafeUserCap)
  ) {
    capReason = 'previous-safe-cap'
  } else if (raw.stable) capReason = 'stable-cap-maintained'

  return finalizeBalancedStability({
    config,
    maxApiRequests,
    configured: MODE_BUDGET_PERCENTS.balanced,
    safetyFactor: config.balancedStabilitySafetyFactor,
    configuredGameCap: apiCap(maxApiRequests, config.balancedGameApiMaxPercent),
    configuredUserCap: apiCap(maxApiRequests, config.balancedUserApiMaxPercent),
    configuredIdentityMin: apiCap(maxApiRequests, config.balancedMinIdentityPercent),
    maintenanceCap: apiCap(maxApiRequests, MODE_BUDGET_PERCENTS.balanced.maintenance),
    calculatedGameCap: raw.calculatedGameCap,
    calculatedUserCap: raw.calculatedUserCap,
    effectiveGameCap,
    effectiveUserCap,
    estimates,
    explicitSeedLimit,
    reason: raw.reason,
    observationSampleCount: sampleCount,
    observedAddedPerGameApi,
    observedAddedPerUserApi,
    observedProcessedPerIdentityApi,
    previousSafeGameCap,
    previousSafeUserCap,
    capReason,
  })
}

function finalizeBalancedStability(params: {
  config: CollectorConfig
  maxApiRequests: number
  configured: (typeof MODE_BUDGET_PERCENTS)['balanced']
  safetyFactor: number
  configuredGameCap: number
  configuredUserCap: number
  configuredIdentityMin: number
  maintenanceCap: number
  calculatedGameCap: number
  calculatedUserCap: number
  effectiveGameCap: number
  effectiveUserCap: number
  estimates: BalancedThroughputEstimates
  explicitSeedLimit: number
  reason: string
  observationSampleCount: number
  observedAddedPerGameApi: number | null
  observedAddedPerUserApi: number | null
  observedProcessedPerIdentityApi: number | null
  previousSafeGameCap: number
  previousSafeUserCap: number
  capReason: string
}): BalancedStabilityResult {
  const identityApiBudget = Math.max(
    params.configuredIdentityMin,
    params.maxApiRequests -
      params.effectiveGameCap -
      params.effectiveUserCap -
      params.maintenanceCap,
  )
  const projectedIdentityAdded =
    params.effectiveGameCap * params.estimates.identitiesAddedPerGameApi +
    params.effectiveUserCap * params.estimates.identitiesAddedPerUserApi +
    params.explicitSeedLimit
  const projectedIdentityProcessed =
    identityApiBudget * params.estimates.identitiesProcessedPerIdentityApi

  const identityPercent = Math.max(
    params.config.balancedMinIdentityPercent,
    Math.round((identityApiBudget / Math.max(1, params.maxApiRequests)) * 100),
  )
  const gamePercent = Math.round((params.effectiveGameCap / Math.max(1, params.maxApiRequests)) * 100)
  const userPercent = Math.round((params.effectiveUserCap / Math.max(1, params.maxApiRequests)) * 100)

  return {
    configuredPercents: { ...params.configured },
    effectivePercents: {
      game: gamePercent,
      identity: identityPercent,
      user: userPercent,
      maintenance: params.configured.maintenance,
    },
    effectiveApiCaps: {
      game: params.effectiveGameCap,
      user: params.effectiveUserCap,
    },
    projectedIdentityAdded,
    projectedIdentityProcessed,
    safetyFactor: params.safetyFactor,
    stable: projectedIdentityAdded <= projectedIdentityProcessed * params.safetyFactor,
    reason: params.reason,
    observationSampleCount: params.observationSampleCount,
    observedAddedPerGameApi: params.observedAddedPerGameApi,
    observedAddedPerUserApi: params.observedAddedPerUserApi,
    observedProcessedPerIdentityApi: params.observedProcessedPerIdentityApi,
    previousSafeGameCap: params.previousSafeGameCap,
    previousSafeUserCap: params.previousSafeUserCap,
    calculatedGameCap: params.calculatedGameCap,
    calculatedUserCap: params.calculatedUserCap,
    effectiveGameCap: params.effectiveGameCap,
    effectiveUserCap: params.effectiveUserCap,
    effectiveIdentityPercent: identityPercent,
    capReason: params.capReason,
  }
}
