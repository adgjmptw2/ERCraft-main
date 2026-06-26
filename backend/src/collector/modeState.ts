/**
 * Single-local-worker operation mode persistence.
 * Do not share this file across multiple collector workers or hosts.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  COLLECTOR_STATE_DIR,
  MODE_STATE_FILE,
  MODE_STATE_TMP_FILE,
} from './collectorPaths.js'
import { loadCollectorConfig } from './config.js'
import {
  evaluateCandidateModeForRecovery,
  type CollectorOperationMode,
  type CollectorModeState,
} from './operationMode.js'

const STATE_DIR = COLLECTOR_STATE_DIR
const STATE_FILE = MODE_STATE_FILE
const STATE_TMP_FILE = MODE_STATE_TMP_FILE

const VALID_MODES = new Set<CollectorOperationMode>([
  'expansion',
  'balanced',
  'drain',
  'emergency-drain',
])

let memoryState: CollectorModeState | null = null

export interface ModeStateLoadResult {
  state: CollectorModeState | null
  modeStateLoaded: boolean
  modeStateValid: boolean
  modeStateRecovered: boolean
  modeStateRecoveryReason: string | null
}

export function readModeStateFromMemory(): CollectorModeState | null {
  return memoryState
}

export function writeModeStateToMemory(state: CollectorModeState): void {
  memoryState = state
}

function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value)
}

function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return false
  if (parsed > Date.now() + 60_000) return false
  return true
}

function parseModeState(raw: unknown): { valid: boolean; state: CollectorModeState | null; reason: string | null } {
  if (raw == null || typeof raw !== 'object') {
    return { valid: false, state: null, reason: 'not-an-object' }
  }
  const record = raw as Record<string, unknown>
  const lastMode = record.lastMode
  if (typeof lastMode !== 'string' || !VALID_MODES.has(lastMode as CollectorOperationMode)) {
    return { valid: false, state: null, reason: 'invalid-mode' }
  }
  if (!isValidIsoDate(record.modeEnteredAt)) {
    return { valid: false, state: null, reason: 'invalid-mode-entered-at' }
  }
  if (!isFiniteNonNegativeInt(record.lastIdentityPending)) {
    return { valid: false, state: null, reason: 'invalid-pending' }
  }
  if (!isFiniteNonNegativeInt(record.lastIdentityAdded)) {
    return { valid: false, state: null, reason: 'invalid-added' }
  }
  if (!isFiniteNonNegativeInt(record.lastIdentityProcessed)) {
    return { valid: false, state: null, reason: 'invalid-processed' }
  }
  const finished = record.lastRunFinishedAt
  if (finished != null && !isValidIsoDate(finished)) {
    return { valid: false, state: null, reason: 'invalid-finished-at' }
  }

  return {
    valid: true,
    state: {
      lastMode: lastMode as CollectorOperationMode,
      modeEnteredAt: record.modeEnteredAt as string,
      lastIdentityPending: record.lastIdentityPending as number,
      lastIdentityAdded: record.lastIdentityAdded as number,
      lastIdentityProcessed: record.lastIdentityProcessed as number,
      lastRunFinishedAt: (finished as string | null) ?? null,
    },
    reason: null,
  }
}

function recoverFromDbPending(dbPending: number): CollectorModeState {
  const config = loadCollectorConfig()
  const evaluated = evaluateCandidateModeForRecovery(config, dbPending)
  return {
    lastMode: evaluated.mode,
    modeEnteredAt: new Date().toISOString(),
    lastIdentityPending: dbPending,
    lastIdentityAdded: 0,
    lastIdentityProcessed: 0,
    lastRunFinishedAt: null,
  }
}

export async function loadCollectorModeState(dbPending?: number): Promise<CollectorModeState | null> {
  const result = await loadCollectorModeStateDetailed(dbPending)
  return result.state
}

export async function loadCollectorModeStateDetailed(
  dbPending?: number,
): Promise<ModeStateLoadResult> {
  if (memoryState) {
    return {
      state: memoryState,
      modeStateLoaded: true,
      modeStateValid: true,
      modeStateRecovered: false,
      modeStateRecoveryReason: null,
    }
  }

  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    if (raw.trim() === '') {
      throw new Error('empty-file')
    }
    const parsed = parseModeState(JSON.parse(raw))
    if (!parsed.valid || !parsed.state) {
      throw new Error(parsed.reason ?? 'invalid-json')
    }
    memoryState = parsed.state
    return {
      state: parsed.state,
      modeStateLoaded: true,
      modeStateValid: true,
      modeStateRecovered: false,
      modeStateRecoveryReason: null,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'load-failed'
    if (dbPending == null) {
      return {
        state: null,
        modeStateLoaded: false,
        modeStateValid: false,
        modeStateRecovered: false,
        modeStateRecoveryReason: reason,
      }
    }
    const recovered = recoverFromDbPending(dbPending)
    memoryState = recovered
    return {
      state: recovered,
      modeStateLoaded: false,
      modeStateValid: false,
      modeStateRecovered: true,
      modeStateRecoveryReason: reason,
    }
  }
}

export async function saveCollectorModeState(state: CollectorModeState): Promise<void> {
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
      // ignore missing destination
    }
    await rename(STATE_TMP_FILE, STATE_FILE)
  }
}

export function buildModeStateSnapshot(params: {
  mode: CollectorOperationMode
  modeEnteredAt: string
  pendingIdentities: number
  identityAdded: number
  identityProcessed: number
  finishedAt?: Date
}): CollectorModeState {
  return {
    lastMode: params.mode,
    modeEnteredAt: params.modeEnteredAt,
    lastIdentityPending: params.pendingIdentities,
    lastIdentityAdded: params.identityAdded,
    lastIdentityProcessed: params.identityProcessed,
    lastRunFinishedAt: params.finishedAt?.toISOString() ?? new Date().toISOString(),
  }
}

export function clearModeStateForTests(): void {
  memoryState = null
}

export function getModeStateFilePathForTests(): string {
  return STATE_FILE
}

export function getModeStateTmpFilePathForTests(): string {
  return STATE_TMP_FILE
}
