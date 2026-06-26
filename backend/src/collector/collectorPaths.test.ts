import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BALANCED_OBSERVATIONS_FILE,
  COLLECTOR_STATE_DIR,
  getBackendRootForTests,
  MODE_STATE_FILE,
  UNKNOWN_COHORT_CUTOFF_FILE,
} from './collectorPaths.js'

describe('collectorPaths', () => {
  it('resolves state files under backend/.collector regardless of cwd', () => {
    const backendRoot = getBackendRootForTests()
    expect(backendRoot.endsWith(`${path.sep}backend`)).toBe(true)
    expect(COLLECTOR_STATE_DIR).toBe(path.join(backendRoot, '.collector'))
    expect(MODE_STATE_FILE).toBe(path.join(backendRoot, '.collector', 'mode-state.json'))
    expect(BALANCED_OBSERVATIONS_FILE).toBe(
      path.join(backendRoot, '.collector', 'balanced-observations.json'),
    )
    expect(UNKNOWN_COHORT_CUTOFF_FILE).toBe(
      path.join(backendRoot, '.collector', 'unknown-cohort-cutoff.json'),
    )
  })
})
