import type { CollectorOperationMode } from './operationMode.js'
import {
  computeIdentityProcessed,
  loadOperationModeThresholds,
  resolveOperationMode,
  type CollectorModeState,
} from './operationMode.js'
import { loadCollectorConfig } from './config.js'

export interface CollectorModeSimulationStep {
  pendingBefore: number
  identityAdded: number
  identityProcessed: number
  elapsedSeconds: number
  previousState?: CollectorModeState | null
}

export interface CollectorModeSimulationResult {
  selectedMode: CollectorOperationMode
  pendingAfter: number
  modeReason: string
  effectivePercentages: {
    game: number
    identity: number
    user: number
    maintenance: number
  }
  transition: string | null
}

export function simulateModeStep(
  step: CollectorModeSimulationStep,
  previousMode: CollectorOperationMode | null = null,
): CollectorModeSimulationResult {
  const config = loadCollectorConfig({ workerId: 'simulation' })
  const pendingAfter = Math.max(0, step.pendingBefore + step.identityAdded - step.identityProcessed)
  const result = resolveOperationMode(
    config,
    {
      pendingIdentities: step.pendingBefore,
      identityAdded: step.identityAdded,
      identityProcessed: step.identityProcessed,
      identityPendingBefore: step.pendingBefore,
      identityPendingAfter: pendingAfter,
      previousState: step.previousState ?? (previousMode
        ? {
            lastMode: previousMode,
            modeEnteredAt: new Date(Date.now() - step.elapsedSeconds * 1000).toISOString(),
            lastIdentityPending: step.pendingBefore,
            lastIdentityAdded: step.identityAdded,
            lastIdentityProcessed: step.identityProcessed,
            lastRunFinishedAt: null,
          }
        : null),
      nowMs: Date.now(),
    },
    'auto',
  )

  return {
    selectedMode: result.mode,
    pendingAfter,
    modeReason: result.reason,
    effectivePercentages: {
      game: result.effectivePercents.game,
      identity: result.effectivePercents.identity,
      user: result.effectivePercents.user,
      maintenance: result.effectivePercents.maintenance,
    },
    transition:
      previousMode && previousMode !== result.mode ? `${previousMode} → ${result.mode}` : null,
  }
}

export interface ModeCycleSimulationReport {
  initialPending: number
  finalPending: number
  maxPending: number
  minPending: number
  modeHours: Record<CollectorOperationMode, number>
  transitions: string[]
  steps: number
}

export function simulateDrainRecoveryRuns(params: {
  initialPending: number
  runs: number
  processedPerRun: number
  addedPerRun?: number
}): ModeCycleSimulationReport {
  let pending = params.initialPending
  let mode: CollectorOperationMode = 'drain'
  const modeHours = {
    expansion: 0,
    balanced: 0,
    drain: 0,
    'emergency-drain': 0,
  }
  const transitions: string[] = []
  let maxPending = pending
  let minPending = pending

  for (let run = 0; run < params.runs; run += 1) {
    const step = simulateModeStep(
      {
        pendingBefore: pending,
        identityAdded: params.addedPerRun ?? 0,
        identityProcessed: params.processedPerRun,
        elapsedSeconds: 600,
      },
      mode,
    )
    if (step.transition) transitions.push(step.transition)
    mode = step.selectedMode
    modeHours[mode] += 1
    pending = step.pendingAfter
    maxPending = Math.max(maxPending, pending)
    minPending = Math.min(minPending, pending)
  }

  return {
    initialPending: params.initialPending,
    finalPending: pending,
    maxPending,
    minPending,
    modeHours,
    transitions,
    steps: params.runs,
  }
}

export function simulate24HourAutoCycle(): ModeCycleSimulationReport & {
  newGameDetails: number
  identityInflow: number
  identityProcessedTotal: number
} {
  const config = loadCollectorConfig({ workerId: 'sim-24h' })
  const thresholds = loadOperationModeThresholds(config)
  const usableDaily = 14_000
  const requestsPerHour = Math.floor(usableDaily / 24)

  let pending = 13_000
  let mode: CollectorOperationMode = 'drain'
  const modeHours = {
    expansion: 0,
    balanced: 0,
    drain: 0,
    'emergency-drain': 0,
  }
  const transitions: string[] = []
  let maxPending = pending
  let minPending = pending
  let newGameDetails = 0
  let identityInflow = 0
  let identityProcessedTotal = 0

  for (let hour = 0; hour < 24; hour += 1) {
    const stepResult = simulateModeStep(
      {
        pendingBefore: pending,
        identityAdded: 0,
        identityProcessed: 0,
        elapsedSeconds: 3600,
      },
      mode,
    )
    if (stepResult.transition) transitions.push(`h${hour}:${stepResult.transition}`)
    mode = stepResult.selectedMode
    modeHours[mode] += 1

    const identityShare = mode === 'emergency-drain' ? 0.95 : mode === 'drain' ? 0.85 : mode === 'balanced' ? 0.55 : 0.25
    const gameShare = mode === 'expansion' ? 0.5 : mode === 'balanced' ? 0.25 : mode === 'drain' ? 0.05 : 0
    const identityApi = Math.floor(requestsPerHour * identityShare)
    const gameApi = Math.floor(requestsPerHour * gameShare)
    const processed = Math.floor(identityApi * 2.19)
    const added =
      mode === 'drain' || mode === 'emergency-drain' ? 0 : gameApi * 22

    identityProcessedTotal += processed
    identityInflow += added
    newGameDetails += gameApi
    pending = Math.max(0, pending + added - processed)
    maxPending = Math.max(maxPending, pending)
    minPending = Math.min(minPending, pending)
  }

  return {
    initialPending: 13_000,
    finalPending: pending,
    maxPending,
    minPending,
    modeHours,
    transitions,
    steps: 24,
    newGameDetails,
    identityInflow,
    identityProcessedTotal,
  }
}

export { computeIdentityProcessed }
