/**
 * Collector state paths resolved from the backend package root.
 * Cwd-independent — safe when CLI is invoked from any working directory.
 * Single-local-worker only; do not share across hosts or workers.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const COLLECTOR_STATE_DIR = path.join(BACKEND_ROOT, '.collector')

export const MODE_STATE_FILE = path.join(COLLECTOR_STATE_DIR, 'mode-state.json')
export const MODE_STATE_TMP_FILE = path.join(COLLECTOR_STATE_DIR, 'mode-state.json.tmp')

export const BALANCED_OBSERVATIONS_FILE = path.join(COLLECTOR_STATE_DIR, 'balanced-observations.json')
export const BALANCED_OBSERVATIONS_TMP_FILE = path.join(
  COLLECTOR_STATE_DIR,
  'balanced-observations.json.tmp',
)

export const UNKNOWN_COHORT_CUTOFF_FILE = path.join(COLLECTOR_STATE_DIR, 'unknown-cohort-cutoff.json')
export const UNKNOWN_BACKFILL_CUTOFF_FILE = path.join(
  COLLECTOR_STATE_DIR,
  'unknown-backfill-cutoff.json',
)

export function getBackendRootForTests(): string {
  return BACKEND_ROOT
}
