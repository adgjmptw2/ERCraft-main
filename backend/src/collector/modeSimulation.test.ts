import { describe, expect, it } from 'vitest'

import {
  simulate24HourAutoCycle,
  simulateDrainRecoveryRuns,
  simulateModeStep,
} from './modeSimulation.js'

describe('modeSimulation', () => {
  it('scenario A: drain recovery reaches balanced threshold', () => {
    const report = simulateDrainRecoveryRuns({
      initialPending: 12_637,
      runs: 20,
      processedPerRun: 350,
      addedPerRun: 0,
    })
    expect(report.finalPending).toBeLessThanOrEqual(7_000)
    expect(report.transitions.some((row) => row.includes('balanced'))).toBe(true)
  })

  it('scenario D: emergency recovers to drain not expansion', () => {
    const step = simulateModeStep(
      {
        pendingBefore: 13_500,
        identityAdded: 0,
        identityProcessed: 400,
        elapsedSeconds: 600,
      },
      'emergency-drain',
    )
    expect(step.selectedMode).toBe('drain')
    expect(step.transition).toBe('emergency-drain → drain')
  })

  it('24h mock simulation reports numeric summary', () => {
    const report = simulate24HourAutoCycle()
    expect(report.initialPending).toBe(13_000)
    expect(report.finalPending).toBeLessThan(report.initialPending)
    expect(report.maxPending).toBeGreaterThanOrEqual(report.initialPending)
    expect(report.identityProcessedTotal).toBeGreaterThan(0)
    expect(
      report.modeHours.expansion +
        report.modeHours.balanced +
        report.modeHours.drain +
        report.modeHours['emergency-drain'],
    ).toBe(24)
  })
})
