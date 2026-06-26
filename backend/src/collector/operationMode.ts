import type { CollectorConfig } from './config.js'
import type { EffectiveBudgetPercents } from './backlogPolicy.js'

export type CollectorOperationMode = 'expansion' | 'balanced' | 'drain' | 'emergency-drain'
export type CollectorModeSource = 'auto' | 'override'
export type BacklogTrend = 'draining' | 'stable' | 'growing'

export interface OperationModeBudgetPercents {
  game: number
  identity: number
  user: number
  maintenance: number
}

export const MODE_BUDGET_PERCENTS: Record<CollectorOperationMode, OperationModeBudgetPercents> = {
  expansion: { game: 50, identity: 25, user: 20, maintenance: 5 },
  balanced: { game: 25, identity: 55, user: 15, maintenance: 5 },
  drain: { game: 5, identity: 85, user: 5, maintenance: 5 },
  'emergency-drain': { game: 0, identity: 95, user: 0, maintenance: 5 },
}

export interface CollectorModeState {
  lastMode: CollectorOperationMode
  modeEnteredAt: string
  lastIdentityPending: number
  lastIdentityAdded: number
  lastIdentityProcessed: number
  lastRunFinishedAt: string | null
}

export interface OperationModeInput {
  pendingIdentities: number
  identityAdded?: number
  identityProcessed?: number
  identityPendingBefore?: number
  identityPendingAfter?: number
  hardCapReached?: boolean
  previousState?: CollectorModeState | null
  nowMs?: number
}

export interface OperationModeResult {
  mode: CollectorOperationMode
  reason: string
  source: CollectorModeSource
  blockGameApi: boolean
  blockUserApi: boolean
  suppressIdentityEnqueueFromGames: boolean
  suppressIdentitySeed: boolean
  limitUserDiscovery: boolean
  modeEnteredAt: string
  modeMinimumRemainingSeconds: number
  effectivePercents: EffectiveBudgetPercents & { operationMode: CollectorOperationMode }
}

export interface OperationModeThresholds {
  balancedEnter: number
  balancedExit: number
  drainEnter: number
  drainExit: number
  emergencyEnter: number
  emergencyExit: number
  growthDrainRatio: number
  growthEmergencyRatio: number
  minDurationSeconds: number
  stableGrowthPercent: number
  runGrowthEmergencyPercent: number
  identityQueueHardCap: number
}

export function loadOperationModeThresholds(config: CollectorConfig): OperationModeThresholds {
  return {
    balancedEnter: config.modeBalancedEnterPending,
    balancedExit: config.modeBalancedExitPending,
    drainEnter: config.modeDrainEnterPending,
    drainExit: config.modeDrainExitPending,
    emergencyEnter: config.modeEmergencyEnterPending,
    emergencyExit: config.modeEmergencyExitPending,
    growthDrainRatio: config.modeGrowthDrainRatio,
    growthEmergencyRatio: config.modeGrowthEmergencyRatio,
    minDurationSeconds: config.modeMinDurationSeconds,
    stableGrowthPercent: config.modeStableGrowthPercent,
    runGrowthEmergencyPercent: config.modeRunGrowthEmergencyPercent,
    identityQueueHardCap: config.identityQueueHardCap,
  }
}

export function validateOperationModeThresholds(thresholds: OperationModeThresholds): void {
  if (thresholds.balancedExit >= thresholds.balancedEnter) {
    throw new Error('COLLECTOR_MODE_BALANCED_EXIT_PENDING must be < COLLECTOR_MODE_BALANCED_ENTER_PENDING')
  }
  if (thresholds.drainExit >= thresholds.drainEnter) {
    throw new Error('COLLECTOR_MODE_DRAIN_EXIT_PENDING must be < COLLECTOR_MODE_DRAIN_ENTER_PENDING')
  }
  if (thresholds.emergencyExit >= thresholds.emergencyEnter) {
    throw new Error('COLLECTOR_MODE_EMERGENCY_EXIT_PENDING must be < COLLECTOR_MODE_EMERGENCY_ENTER_PENDING')
  }
  if (thresholds.drainEnter < thresholds.balancedEnter) {
    throw new Error('COLLECTOR_MODE_DRAIN_ENTER_PENDING must be >= COLLECTOR_MODE_BALANCED_ENTER_PENDING')
  }
  if (thresholds.emergencyEnter < thresholds.drainEnter) {
    throw new Error('COLLECTOR_MODE_EMERGENCY_ENTER_PENDING must be >= COLLECTOR_MODE_DRAIN_ENTER_PENDING')
  }
}

export function parseCollectorOperationMode(
  raw: string | undefined,
): CollectorOperationMode | 'auto' {
  if (raw == null || raw.trim() === '' || raw === 'auto') return 'auto'
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'expansion') return 'expansion'
  if (normalized === 'balanced') return 'balanced'
  if (normalized === 'drain') return 'drain'
  if (normalized === 'emergency-drain' || normalized === 'emergency_drain') return 'emergency-drain'
  throw new Error(`Unknown collector mode: ${raw}`)
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return numerator / denominator
}

export function computeIdentityProcessed(metrics: {
  resolved: number
  mismatch: number
  outOfWindow: number
  ambiguous: number
  deferredOldSource: number
}): number {
  return (
    metrics.resolved +
    metrics.mismatch +
    metrics.outOfWindow +
    metrics.ambiguous +
    metrics.deferredOldSource
  )
}

export function computeBacklogTrend(
  before: number,
  after: number,
  stablePercent: number,
): BacklogTrend {
  if (after < before) return 'draining'
  const growth = safeRatio(after - before, before)
  if (growth != null && growth > stablePercent) return 'growing'
  if (after > before) return 'growing'
  return 'stable'
}

function inflowRatio(added: number, processed: number): number | null {
  return safeRatio(added, processed)
}

function modePercents(mode: CollectorOperationMode, pendingIdentities: number): EffectiveBudgetPercents & {
  operationMode: CollectorOperationMode
} {
  const percents = MODE_BUDGET_PERCENTS[mode]
  return {
    ...percents,
    stage: mode === 'expansion' ? 'normal' : mode === 'balanced' ? 'soft' : 'hard',
    pendingIdentities,
    operationMode: mode,
  }
}

function minRemainingSeconds(state: CollectorModeState | null | undefined, thresholds: OperationModeThresholds, nowMs: number): number {
  if (!state?.modeEnteredAt) return 0
  const entered = Date.parse(state.modeEnteredAt)
  if (!Number.isFinite(entered)) return 0
  const elapsed = Math.floor((nowMs - entered) / 1000)
  return Math.max(0, thresholds.minDurationSeconds - elapsed)
}

function canExitMode(
  current: CollectorOperationMode,
  target: CollectorOperationMode,
  pending: number,
  thresholds: OperationModeThresholds,
  state: CollectorModeState | null | undefined,
  nowMs: number,
): boolean {
  if (current === target) return true
  if (minRemainingSeconds(state, thresholds, nowMs) > 0 && current !== 'emergency-drain') {
    return false
  }
  switch (current) {
    case 'emergency-drain':
      return pending <= thresholds.emergencyExit
    case 'drain':
      return pending <= thresholds.drainExit && target !== 'emergency-drain'
    case 'balanced':
      return pending <= thresholds.balancedExit && target !== 'drain' && target !== 'emergency-drain'
    case 'expansion':
      return true
  }
}

function evaluateCandidateMode(input: OperationModeInput, thresholds: OperationModeThresholds): {
  mode: CollectorOperationMode
  reason: string
} {
  const pending = input.pendingIdentities
  const added = input.identityAdded ?? 0
  const processed = input.identityProcessed ?? 0
  const ratio = inflowRatio(added, processed)
  const before = input.identityPendingBefore
  const after = input.identityPendingAfter ?? pending
  const runGrowth =
    before != null && before > 0 ? safeRatio(after - before, before) : null

  if (input.hardCapReached || pending >= thresholds.identityQueueHardCap) {
    return { mode: 'emergency-drain', reason: 'identity-queue-hard-cap' }
  }
  if (pending >= thresholds.emergencyEnter) {
    return { mode: 'emergency-drain', reason: 'pending-emergency-enter' }
  }
  if (ratio != null && ratio >= thresholds.growthEmergencyRatio && added > 0) {
    return { mode: 'emergency-drain', reason: 'inflow-emergency-ratio' }
  }
  if (runGrowth != null && runGrowth >= thresholds.runGrowthEmergencyPercent / 100) {
    return { mode: 'emergency-drain', reason: 'run-growth-emergency' }
  }
  if (pending >= thresholds.drainEnter) {
    return { mode: 'drain', reason: 'pending-drain-enter' }
  }
  if (ratio != null && ratio >= thresholds.growthDrainRatio && added > 0 && processed > 0) {
    return { mode: 'drain', reason: 'inflow-drain-ratio' }
  }
  if (pending >= thresholds.balancedEnter) {
    return { mode: 'balanced', reason: 'pending-balanced-enter' }
  }
  if (processed > 0 && added <= processed) {
    return { mode: 'expansion', reason: 'processed-covers-inflow' }
  }
  if (pending < thresholds.balancedExit) {
    return { mode: 'expansion', reason: 'pending-low' }
  }
  return { mode: 'balanced', reason: 'fallback-balanced' }
}

export function evaluateCandidateModeForRecovery(
  config: CollectorConfig,
  pendingIdentities: number,
): { mode: CollectorOperationMode; reason: string } {
  return evaluateCandidateMode(
    { pendingIdentities },
    loadOperationModeThresholds(config),
  )
}

function applyHysteresis(
  candidate: CollectorOperationMode,
  previous: CollectorOperationMode | null | undefined,
  input: OperationModeInput,
  thresholds: OperationModeThresholds,
  nowMs: number,
): { mode: CollectorOperationMode; reason: string } {
  const evaluated = evaluateCandidateMode(input, thresholds)
  if (!previous || previous === evaluated.mode) return evaluated

  const order: CollectorOperationMode[] = ['expansion', 'balanced', 'drain', 'emergency-drain']
  const prevIdx = order.indexOf(previous)
  const candIdx = order.indexOf(evaluated.mode)
  const state = input.previousState ?? null

  if (candIdx > prevIdx) {
    return evaluated
  }

  if (!canExitMode(previous, evaluated.mode, input.pendingIdentities, thresholds, state, nowMs)) {
    return { mode: previous, reason: `hysteresis-hold:${previous}` }
  }

  if (candIdx < prevIdx) {
    const stepDown = order[prevIdx - 1]!
    return { mode: stepDown, reason: `hysteresis-step-down:${stepDown}` }
  }

  return evaluated
}

function policyForMode(mode: CollectorOperationMode): Pick<
  OperationModeResult,
  'blockGameApi' | 'blockUserApi' | 'suppressIdentityEnqueueFromGames' | 'suppressIdentitySeed' | 'limitUserDiscovery'
> {
  switch (mode) {
    case 'emergency-drain':
      return {
        blockGameApi: true,
        blockUserApi: true,
        suppressIdentityEnqueueFromGames: true,
        suppressIdentitySeed: true,
        limitUserDiscovery: true,
      }
    case 'drain':
      return {
        blockGameApi: false,
        blockUserApi: false,
        suppressIdentityEnqueueFromGames: true,
        suppressIdentitySeed: true,
        limitUserDiscovery: true,
      }
    case 'balanced':
      return {
        blockGameApi: false,
        blockUserApi: false,
        suppressIdentityEnqueueFromGames: false,
        suppressIdentitySeed: true,
        limitUserDiscovery: false,
      }
    case 'expansion':
      return {
        blockGameApi: false,
        blockUserApi: false,
        suppressIdentityEnqueueFromGames: false,
        suppressIdentitySeed: false,
        limitUserDiscovery: false,
      }
  }
}

export function resolveOperationMode(
  config: CollectorConfig,
  input: OperationModeInput,
  source: CollectorModeSource,
  overrideMode?: CollectorOperationMode,
): OperationModeResult {
  const thresholds = loadOperationModeThresholds(config)
  validateOperationModeThresholds(thresholds)
  const nowMs = input.nowMs ?? Date.now()
  const previous = input.previousState?.lastMode

  let selected: { mode: CollectorOperationMode; reason: string }
  if (source === 'override' && overrideMode) {
    selected = { mode: overrideMode, reason: `override:${overrideMode}` }
  } else if (input.identityProcessed == null && input.identityAdded == null && !input.previousState) {
    const evaluated = evaluateCandidateMode(input, thresholds)
    selected = evaluated
  } else {
    selected = applyHysteresis(
      evaluateCandidateMode(input, thresholds).mode,
      previous,
      input,
      thresholds,
      nowMs,
    )
  }

  const enteredAt =
    previous === selected.mode && input.previousState?.modeEnteredAt
      ? input.previousState.modeEnteredAt
      : new Date(nowMs).toISOString()

  const policy = policyForMode(selected.mode)
  return {
    mode: selected.mode,
    reason: selected.reason,
    source,
    ...policy,
    modeEnteredAt: enteredAt,
    modeMinimumRemainingSeconds: minRemainingSeconds(
      previous === selected.mode ? input.previousState ?? null : { lastMode: selected.mode, modeEnteredAt: enteredAt, lastIdentityPending: input.pendingIdentities, lastIdentityAdded: input.identityAdded ?? 0, lastIdentityProcessed: input.identityProcessed ?? 0, lastRunFinishedAt: null },
      thresholds,
      nowMs,
    ),
    effectivePercents: modePercents(selected.mode, input.pendingIdentities),
  }
}

export function shouldAllowDeepVerificationInDrain(
  config: CollectorConfig,
  resolvedPerPage: number | null,
  identityApiShare: number,
): boolean {
  if (resolvedPerPage != null && resolvedPerPage < config.drainDeepMinResolvedPerPage) return false
  if (identityApiShare > config.drainDeepMaxApiPercent / 100) return false
  return config.identityDeepEnabled
}
