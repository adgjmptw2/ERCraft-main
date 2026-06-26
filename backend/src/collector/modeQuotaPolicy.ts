import type { CollectorConfig } from './config.js'
import type { CollectorOperationMode } from './operationMode.js'
import { MODE_BUDGET_PERCENTS } from './operationMode.js'
import type { CollectorWorkKind } from './runBudget.js'
import type { BalancedStabilityResult } from './balancedStability.js'

export interface CollectorModeQuotaPolicy {
  mode: CollectorOperationMode
  percentages: {
    game: number
    identity: number
    user: number
    maintenance: number
  }
  apiCaps: Partial<Record<'game' | 'user', number>>
  overflowPriority: CollectorWorkKind[]
  blockedApiKinds: CollectorWorkKind[]
  userOnlyWhenIdentityEmpty: boolean
}

export interface CollectorQuotaMetrics {
  blockedGameApiAttempts: number
  blockedUserApiAttempts: number
  gameQuotaReturned: number
  userQuotaReturned: number
  identityQuotaReceived: number
}

export function createQuotaMetrics(): CollectorQuotaMetrics {
  return {
    blockedGameApiAttempts: 0,
    blockedUserApiAttempts: 0,
    gameQuotaReturned: 0,
    userQuotaReturned: 0,
    identityQuotaReceived: 0,
  }
}

function apiCap(maxApiRequests: number, percent: number): number {
  return Math.max(0, Math.floor((maxApiRequests * percent) / 100))
}

export function buildModeQuotaPolicy(
  mode: CollectorOperationMode,
  config: CollectorConfig,
  maxApiRequests: number,
  balancedStability?: BalancedStabilityResult,
): CollectorModeQuotaPolicy {
  const percentages = MODE_BUDGET_PERCENTS[mode]

  if (mode === 'emergency-drain') {
    return {
      mode,
      percentages,
      apiCaps: { game: 0, user: 0 },
      overflowPriority: ['identity', 'maintenance'],
      blockedApiKinds: ['game', 'user'],
      userOnlyWhenIdentityEmpty: false,
    }
  }

  if (mode === 'drain') {
    return {
      mode,
      percentages,
      apiCaps: {
        game: apiCap(maxApiRequests, config.drainGameApiMaxPercent),
        user: apiCap(maxApiRequests, config.drainUserApiMaxPercent),
      },
      overflowPriority: ['identity', 'maintenance', 'user'],
      blockedApiKinds: [],
      userOnlyWhenIdentityEmpty: true,
    }
  }

  if (mode === 'balanced') {
    const stability =
      balancedStability ??
      (() => {
        throw new Error('balanced mode requires precomputed stability policy')
      })()
    return {
      mode,
      percentages: stability.effectivePercents,
      apiCaps: stability.effectiveApiCaps,
      overflowPriority: ['identity', 'maintenance', 'user', 'game'],
      blockedApiKinds: [],
      userOnlyWhenIdentityEmpty: true,
    }
  }

  return {
    mode,
    percentages,
    apiCaps: {},
    overflowPriority: ['game', 'identity', 'user', 'maintenance'],
    blockedApiKinds: [],
    userOnlyWhenIdentityEmpty: false,
  }
}

export function isApiKindBlocked(
  policy: CollectorModeQuotaPolicy | null | undefined,
  kind: CollectorWorkKind,
): boolean {
  if (!policy) return false
  return policy.blockedApiKinds.includes(kind)
}

export function apiCapForKind(
  policy: CollectorModeQuotaPolicy | null | undefined,
  kind: CollectorWorkKind,
): number | null {
  if (!policy || kind === 'identity' || kind === 'maintenance') return null
  const cap = policy.apiCaps[kind as 'game' | 'user']
  return cap == null ? null : cap
}
