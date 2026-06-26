import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearModeStateForTests,
  getModeStateFilePathForTests,
  getModeStateTmpFilePathForTests,
  loadCollectorModeStateDetailed,
  saveCollectorModeState,
} from './modeState.js'

const stateDir = path.dirname(getModeStateFilePathForTests())

describe('modeState', () => {
  beforeEach(async () => {
    clearModeStateForTests()
    await mkdir(stateDir, { recursive: true })
  })

  afterEach(async () => {
    clearModeStateForTests()
    await rm(getModeStateFilePathForTests(), { force: true })
    await rm(getModeStateTmpFilePathForTests(), { force: true })
  })

  it('atomic write leaves valid JSON in mode-state.json', async () => {
    await saveCollectorModeState({
      lastMode: 'drain',
      modeEnteredAt: new Date().toISOString(),
      lastIdentityPending: 12_637,
      lastIdentityAdded: 0,
      lastIdentityProcessed: 350,
      lastRunFinishedAt: new Date().toISOString(),
    })
    const raw = await readFile(getModeStateFilePathForTests(), 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.lastMode).toBe('drain')
    await expect(readFile(getModeStateTmpFilePathForTests())).rejects.toThrow()
  })

  it('recovers from empty file using DB pending conservatively', async () => {
    await writeFile(getModeStateFilePathForTests(), '', 'utf8')
    const result = await loadCollectorModeStateDetailed(12_637)
    expect(result.modeStateRecovered).toBe(true)
    expect(result.state?.lastMode).toBe('drain')
    expect(result.state?.lastIdentityPending).toBe(12_637)
  })

  it('recovers from invalid JSON without trusting expansion', async () => {
    await writeFile(getModeStateFilePathForTests(), '{bad json', 'utf8')
    const result = await loadCollectorModeStateDetailed(21_000)
    expect(result.modeStateRecovered).toBe(true)
    expect(result.state?.lastMode).toBe('emergency-drain')
  })

  it('recovers from future timestamp', async () => {
    await writeFile(
      getModeStateFilePathForTests(),
      JSON.stringify({
        lastMode: 'expansion',
        modeEnteredAt: new Date(Date.now() + 86_400_000).toISOString(),
        lastIdentityPending: 1000,
        lastIdentityAdded: 0,
        lastIdentityProcessed: 0,
        lastRunFinishedAt: null,
      }),
      'utf8',
    )
    const result = await loadCollectorModeStateDetailed(12_000)
    expect(result.modeStateValid).toBe(false)
    expect(result.state?.lastMode).toBe('drain')
  })
})
