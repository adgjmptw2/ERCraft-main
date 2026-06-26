/**
 * Single-local-worker balanced throughput observations.
 * Do not share across multiple collector workers or hosts.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'

import {
  BALANCED_OBSERVATIONS_FILE,
  BALANCED_OBSERVATIONS_TMP_FILE,
  COLLECTOR_STATE_DIR,
} from './collectorPaths.js'
import type { CollectorConfig } from './config.js'
import type { BalancedThroughputEstimates } from './balancedStability.js'
import { DEFAULT_BALANCED_ESTIMATES } from './balancedStability.js'

export const BALANCED_OBSERVATION_SCHEMA_VERSION = 1

export interface BalancedRunObservation {
  gameApiRequests: number
  userApiRequests: number
  identityApiRequests: number
  maintenanceApiRequests: number
  identitiesAddedFromGameDetail: number
  identitiesAddedFromUserDiscovery: number
  identitiesAddedFromManualSeed: number
  identitiesAddedFromRepair: number
  identitiesAddedFromOther: number
  identitiesProcessed: number
  pendingBefore: number
  pendingAfter: number
  totalApiRequests: number
  dryRun: boolean
  fatalError: boolean
  mode: string
  modeSource: string
  apiMetricsValid: boolean
}

export interface BalancedObservationState {
  schemaVersion: number
  updatedAt: string
  sampleCount: number
  ewmaIdentitiesAddedPerGameApi: number | null
  ewmaIdentitiesAddedPerUserApi: number | null
  ewmaIdentitiesProcessedPerIdentityApi: number | null
  lastSafeGameCapPercent: number
  lastSafeUserCapPercent: number
  lastObservation: BalancedRunObservation | null
}

const STATE_DIR = COLLECTOR_STATE_DIR
const STATE_FILE = BALANCED_OBSERVATIONS_FILE
const STATE_TMP_FILE = BALANCED_OBSERVATIONS_TMP_FILE

export const FALLBACK_SAFE_GAME_CAP_PERCENT = 1
export const FALLBACK_SAFE_USER_CAP_PERCENT = 1

let memoryState: BalancedObservationState | null = null

function isFiniteRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function emptyState(): BalancedObservationState {
  return {
    schemaVersion: BALANCED_OBSERVATION_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    sampleCount: 0,
    ewmaIdentitiesAddedPerGameApi: null,
    ewmaIdentitiesAddedPerUserApi: null,
    ewmaIdentitiesProcessedPerIdentityApi: null,
    lastSafeGameCapPercent: FALLBACK_SAFE_GAME_CAP_PERCENT,
    lastSafeUserCapPercent: FALLBACK_SAFE_USER_CAP_PERCENT,
    lastObservation: null,
  }
}

function parseState(raw: unknown): { valid: boolean; state: BalancedObservationState | null } {
  if (raw == null || typeof raw !== 'object') return { valid: false, state: null }
  const record = raw as Record<string, unknown>
  if (record.schemaVersion !== BALANCED_OBSERVATION_SCHEMA_VERSION) {
    return { valid: false, state: null }
  }
  const sampleCount = record.sampleCount
  if (!Number.isFinite(sampleCount as number) || (sampleCount as number) < 0) return { valid: false, state: null }
  const lastSafeGameCapPercent = record.lastSafeGameCapPercent
  const lastSafeUserCapPercent = record.lastSafeUserCapPercent
  if (!isFiniteRate(lastSafeGameCapPercent) || !isFiniteRate(lastSafeUserCapPercent)) {
    return { valid: false, state: null }
  }
  const ewmaGame = record.ewmaIdentitiesAddedPerGameApi
  const ewmaUser = record.ewmaIdentitiesAddedPerUserApi
  const ewmaProcessed = record.ewmaIdentitiesProcessedPerIdentityApi
  if (
    (ewmaGame != null && !isFiniteRate(ewmaGame)) ||
    (ewmaUser != null && !isFiniteRate(ewmaUser)) ||
    (ewmaProcessed != null && !isFiniteRate(ewmaProcessed))
  ) {
    return { valid: false, state: null }
  }
  return {
    valid: true,
    state: {
      schemaVersion: BALANCED_OBSERVATION_SCHEMA_VERSION,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
      sampleCount: Math.floor(sampleCount as number),
      ewmaIdentitiesAddedPerGameApi: ewmaGame == null ? null : (ewmaGame as number),
      ewmaIdentitiesAddedPerUserApi: ewmaUser == null ? null : (ewmaUser as number),
      ewmaIdentitiesProcessedPerIdentityApi:
        ewmaProcessed == null ? null : (ewmaProcessed as number),
      lastSafeGameCapPercent: lastSafeGameCapPercent as number,
      lastSafeUserCapPercent: lastSafeUserCapPercent as number,
      lastObservation:
        record.lastObservation == null || typeof record.lastObservation !== 'object'
          ? null
          : (record.lastObservation as BalancedRunObservation),
    },
  }
}

export function ratesFromObservation(obs: BalancedRunObservation): {
  identitiesAddedPerGameApi: number | null
  identitiesAddedPerUserApi: number | null
  identitiesProcessedPerIdentityApi: number | null
} {
  return {
    identitiesAddedPerGameApi:
      obs.gameApiRequests > 0 ? obs.identitiesAddedFromGameDetail / obs.gameApiRequests : null,
    identitiesAddedPerUserApi:
      obs.userApiRequests > 0 ? obs.identitiesAddedFromUserDiscovery / obs.userApiRequests : null,
    identitiesProcessedPerIdentityApi:
      obs.identityApiRequests > 0 ? obs.identitiesProcessed / obs.identityApiRequests : null,
  }
}

export function isValidBalancedObservation(obs: BalancedRunObservation): boolean {
  if (obs.dryRun || obs.fatalError || !obs.apiMetricsValid) return false
  if (obs.mode !== 'balanced' || obs.modeSource !== 'auto') return false
  if (obs.totalApiRequests <= 0) return false
  const categorySum =
    obs.gameApiRequests +
    obs.userApiRequests +
    obs.identityApiRequests +
    obs.maintenanceApiRequests
  if (categorySum !== obs.totalApiRequests) return false
  const enqueueSum =
    obs.identitiesAddedFromGameDetail +
    obs.identitiesAddedFromUserDiscovery +
    obs.identitiesAddedFromManualSeed +
    obs.identitiesAddedFromRepair +
    obs.identitiesAddedFromOther
  if (!Number.isFinite(enqueueSum) || enqueueSum < 0) return false
  if (obs.pendingBefore < 0 || obs.pendingAfter < 0) return false
  if (obs.identitiesProcessed < 0) return false
  return true
}

function ewmaUpdate(previous: number | null, next: number, alpha: number): number {
  if (previous == null) return next
  return previous * (1 - alpha) + next * alpha
}

export function conservativeEstimatesFromState(
  state: BalancedObservationState | null,
  config: CollectorConfig,
): BalancedThroughputEstimates {
  if (
    state == null ||
    state.sampleCount < config.balancedObservationMinSamples ||
    state.ewmaIdentitiesProcessedPerIdentityApi == null
  ) {
    return {
      identitiesAddedPerGameApi: DEFAULT_BALANCED_ESTIMATES.identitiesAddedPerGameApi,
      identitiesAddedPerUserApi: DEFAULT_BALANCED_ESTIMATES.identitiesAddedPerUserApi,
      identitiesProcessedPerIdentityApi: DEFAULT_BALANCED_ESTIMATES.identitiesProcessedPerIdentityApi,
    }
  }
  return {
    identitiesAddedPerGameApi:
      state.ewmaIdentitiesAddedPerGameApi ?? DEFAULT_BALANCED_ESTIMATES.identitiesAddedPerGameApi,
    identitiesAddedPerUserApi:
      state.ewmaIdentitiesAddedPerUserApi ?? DEFAULT_BALANCED_ESTIMATES.identitiesAddedPerUserApi,
    identitiesProcessedPerIdentityApi: state.ewmaIdentitiesProcessedPerIdentityApi,
  }
}

export function applyObservationToState(
  state: BalancedObservationState,
  obs: BalancedRunObservation,
  config: CollectorConfig,
): BalancedObservationState {
  const rates = ratesFromObservation(obs)
  const alpha = config.balancedEwmaAlpha
  const next: BalancedObservationState = {
    ...state,
    updatedAt: new Date().toISOString(),
    sampleCount: state.sampleCount + 1,
    ewmaIdentitiesAddedPerGameApi:
      rates.identitiesAddedPerGameApi == null
        ? state.ewmaIdentitiesAddedPerGameApi
        : ewmaUpdate(
            state.ewmaIdentitiesAddedPerGameApi,
            rates.identitiesAddedPerGameApi,
            alpha,
          ),
    ewmaIdentitiesAddedPerUserApi:
      rates.identitiesAddedPerUserApi == null
        ? state.ewmaIdentitiesAddedPerUserApi
        : ewmaUpdate(
            state.ewmaIdentitiesAddedPerUserApi,
            rates.identitiesAddedPerUserApi,
            alpha,
          ),
    ewmaIdentitiesProcessedPerIdentityApi:
      rates.identitiesProcessedPerIdentityApi == null
        ? state.ewmaIdentitiesProcessedPerIdentityApi
        : ewmaUpdate(
            state.ewmaIdentitiesProcessedPerIdentityApi,
            rates.identitiesProcessedPerIdentityApi,
            alpha,
          ),
    lastObservation: obs,
  }
  return next
}

export async function loadBalancedObservationState(): Promise<BalancedObservationState> {
  if (memoryState) return memoryState
  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    if (raw.trim() === '') throw new Error('empty')
    const parsed = parseState(JSON.parse(raw))
    if (!parsed.valid || !parsed.state) throw new Error('invalid')
    memoryState = parsed.state
    return parsed.state
  } catch {
    memoryState = emptyState()
    return memoryState
  }
}

export async function saveBalancedObservationState(state: BalancedObservationState): Promise<void> {
  memoryState = state
  await mkdir(STATE_DIR, { recursive: true })
  const content = JSON.stringify(state, null, 2)
  await writeFile(STATE_TMP_FILE, content, 'utf8')
  try {
    await rename(STATE_TMP_FILE, STATE_FILE)
  } catch {
    try {
      await unlink(STATE_FILE)
    } catch {
      // ignore
    }
    await rename(STATE_TMP_FILE, STATE_FILE)
  }
}

export function clearBalancedObservationStateForTests(): void {
  memoryState = null
}

export function getBalancedObservationFilePathForTests(): string {
  return STATE_FILE
}

export function capPercentFromApiCap(maxApiRequests: number, apiCap: number): number {
  if (maxApiRequests <= 0) return 0
  return Math.max(0, Math.round((apiCap / maxApiRequests) * 100))
}

export function applyCapRiseLimit(
  previousPercent: number,
  calculatedPercent: number,
  maxIncreasePerRun: number,
  allowIncrease: boolean,
): number {
  if (!allowIncrease || calculatedPercent <= previousPercent) return calculatedPercent
  return Math.min(calculatedPercent, previousPercent + maxIncreasePerRun)
}
