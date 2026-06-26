import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'

import {
  COLLECTOR_STATE_DIR,
  UNKNOWN_BACKFILL_CUTOFF_FILE,
  UNKNOWN_COHORT_CUTOFF_FILE,
} from '../../collector/collectorPaths.js'

export interface UnknownBackfillCutoffState {
  completedAt: string
  unknownBefore: number
  unknownAfter: number
}

export interface UnknownCohortCutoffState {
  cutoffAt: string
  rankPlayerMatches: number
  unknownCount: number
  unknownRatePercent: number
}

export async function resolveUnknownCohortCutoff(): Promise<string | null> {
  const env = process.env.UNKNOWN_AUDIT_COHORT_CUTOFF_ISO?.trim()
  if (env) return env
  try {
    const raw = JSON.parse(await readFile(UNKNOWN_COHORT_CUTOFF_FILE, 'utf8')) as UnknownCohortCutoffState
    if (typeof raw.cutoffAt === 'string' && raw.cutoffAt.trim() !== '') {
      return raw.cutoffAt
    }
  } catch {
    // missing or invalid cohort cutoff file
  }
  try {
    const raw = JSON.parse(await readFile(UNKNOWN_BACKFILL_CUTOFF_FILE, 'utf8')) as UnknownBackfillCutoffState
    if (typeof raw.completedAt === 'string' && raw.completedAt.trim() !== '') {
      return raw.completedAt
    }
  } catch {
    // missing or invalid backfill cutoff file
  }
  return null
}

export async function saveUnknownBackfillCutoff(state: UnknownBackfillCutoffState): Promise<void> {
  await mkdir(COLLECTOR_STATE_DIR, { recursive: true })
  const content = JSON.stringify(state, null, 2)
  const tmp = `${UNKNOWN_BACKFILL_CUTOFF_FILE}.tmp`
  await writeFile(tmp, content, 'utf8')
  try {
    await rename(tmp, UNKNOWN_BACKFILL_CUTOFF_FILE)
  } catch {
    try {
      await unlink(UNKNOWN_BACKFILL_CUTOFF_FILE)
    } catch {
      // ignore
    }
    await rename(tmp, UNKNOWN_BACKFILL_CUTOFF_FILE)
  }
}

export async function saveUnknownCohortCutoff(state: UnknownCohortCutoffState): Promise<void> {
  await mkdir(COLLECTOR_STATE_DIR, { recursive: true })
  const content = JSON.stringify(state, null, 2)
  const tmp = `${UNKNOWN_COHORT_CUTOFF_FILE}.tmp`
  await writeFile(tmp, content, 'utf8')
  try {
    await rename(tmp, UNKNOWN_COHORT_CUTOFF_FILE)
  } catch {
    try {
      await unlink(UNKNOWN_COHORT_CUTOFF_FILE)
    } catch {
      // ignore
    }
    await rename(tmp, UNKNOWN_COHORT_CUTOFF_FILE)
  }
}

export function getUnknownCohortCutoffPathForTests(): string {
  return UNKNOWN_COHORT_CUTOFF_FILE
}

export function getUnknownBackfillCutoffPathForTests(): string {
  return UNKNOWN_BACKFILL_CUTOFF_FILE
}
