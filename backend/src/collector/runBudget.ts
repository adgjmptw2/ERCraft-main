import type { EffectiveBudgetPercents } from './backlogPolicy.js'
import {
  apiCapForKind,
  isApiKindBlocked,
  type CollectorModeQuotaPolicy,
  type CollectorQuotaMetrics,
} from './modeQuotaPolicy.js'

export type CollectorWorkKind = 'game' | 'identity' | 'user' | 'maintenance'

export interface CollectorQueueAvailability {
  game: boolean
  identity: boolean
  user: boolean
}

export type CollectorStopReason =
  | 'max-requests-reached'
  | 'daily-budget-exhausted'
  | 'no-runnable-work'
  | 'no-runnable-drain-work'
  | 'fatal-auth-error'
  | 'manual-stop'
  | 'max-work-iterations-reached'
  | 'unexpected-error'
  | 'dry-run'

export interface CollectorRunBudgetSnapshot {
  maxApiRequests: number
  apiUsed: number
  apiGameUsed: number
  apiIdentityUsed: number
  apiUserUsed: number
  apiMaintenanceUsed: number
  gameMinimum: number
  identityMinimum: number
  userMinimum: number
  maintenanceMinimum: number
  effectivePercents: EffectiveBudgetPercents
  minimumsMet: boolean
  configuredPercentages?: {
    game: number
    identity: number
    user: number
    maintenance: number
  }
  effectiveApiCaps?: Partial<Record<'game' | 'user', number>>
  actualApiPercentages?: {
    game: number
    identity: number
    user: number
    maintenance: number
  }
  quotaMetrics?: CollectorQuotaMetrics
}

function percentForKind(percents: EffectiveBudgetPercents, kind: CollectorWorkKind): number {
  switch (kind) {
    case 'game':
      return percents.game
    case 'identity':
      return percents.identity
    case 'user':
      return percents.user
    case 'maintenance':
      return percents.maintenance
  }
}

function guaranteedMinimum(maxApiRequests: number, percent: number): number {
  return Math.max(0, Math.floor((maxApiRequests * percent) / 100))
}

export class CollectorRunBudget {
  private apiGameUsed = 0
  private apiIdentityUsed = 0
  private apiUserUsed = 0
  private apiMaintenanceUsed = 0
  private apiUsed = 0
  private effectivePercents: EffectiveBudgetPercents
  private lastOverflowKind: CollectorWorkKind | null = null

  constructor(
    private readonly maxApiRequests: number,
    effectivePercents: EffectiveBudgetPercents,
    private readonly quotaPolicy: CollectorModeQuotaPolicy | null = null,
    private readonly quotaMetrics: CollectorQuotaMetrics | null = null,
  ) {
    this.effectivePercents = effectivePercents
  }

  updateEffectivePercents(percents: EffectiveBudgetPercents): void {
    this.effectivePercents = percents
  }

  getQuotaPolicy(): CollectorModeQuotaPolicy | null {
    return this.quotaPolicy
  }

  getQuotaMetrics(): CollectorQuotaMetrics | null {
    return this.quotaMetrics
  }

  private usedFor(kind: CollectorWorkKind): number {
    switch (kind) {
      case 'game':
        return this.apiGameUsed
      case 'identity':
        return this.apiIdentityUsed
      case 'user':
        return this.apiUserUsed
      case 'maintenance':
        return this.apiMaintenanceUsed
    }
  }

  private minimumFor(kind: CollectorWorkKind): number {
    return guaranteedMinimum(this.maxApiRequests, percentForKind(this.effectivePercents, kind))
  }

  atApiCap(kind: CollectorWorkKind): boolean {
    const cap = apiCapForKind(this.quotaPolicy, kind)
    if (cap == null) return false
    return this.usedFor(kind) >= cap
  }

  recordBlockedAttempt(kind: CollectorWorkKind): void {
    if (!this.quotaMetrics) return
    if (kind === 'game') this.quotaMetrics.blockedGameApiAttempts += 1
    if (kind === 'user') this.quotaMetrics.blockedUserApiAttempts += 1
  }

  recordApi(kind: CollectorWorkKind, count = 1): void {
    if (count <= 0) return
    switch (kind) {
      case 'game':
        this.apiGameUsed += count
        break
      case 'identity':
        this.apiIdentityUsed += count
        break
      case 'user':
        this.apiUserUsed += count
        break
      case 'maintenance':
        this.apiMaintenanceUsed += count
        break
    }
    this.apiUsed += count
  }

  getApiUsed(): number {
    return this.apiUsed
  }

  canSpendApiTotal(): boolean {
    return this.apiUsed < this.maxApiRequests
  }

  private isActive(kind: CollectorWorkKind, queues: CollectorQueueAvailability): boolean {
    if (kind === 'maintenance') return true
    if (kind === 'game') return queues.game
    if (kind === 'identity') return queues.identity
    return queues.user
  }

  minimumsMetForActiveQueues(queues: CollectorQueueAvailability): boolean {
    const kinds: CollectorWorkKind[] = ['game', 'identity', 'user']
    for (const kind of kinds) {
      if (!this.isActive(kind, queues)) continue
      if (this.usedFor(kind) < this.minimumFor(kind)) return false
    }
    return true
  }

  private blockedByPolicy(kind: CollectorWorkKind, queues: CollectorQueueAvailability): boolean {
    if (isApiKindBlocked(this.quotaPolicy, kind)) {
      this.recordBlockedAttempt(kind)
      return true
    }
    if (this.atApiCap(kind)) {
      this.recordBlockedAttempt(kind)
      if (kind === 'game' && this.quotaMetrics) this.quotaMetrics.gameQuotaReturned += 1
      if (kind === 'user' && this.quotaMetrics) this.quotaMetrics.userQuotaReturned += 1
      return true
    }
    if (
      this.quotaPolicy?.userOnlyWhenIdentityEmpty &&
      kind === 'user' &&
      queues.identity &&
      this.minimumsMetForActiveQueues(queues)
    ) {
      this.recordBlockedAttempt(kind)
      return true
    }
    return false
  }

  canSpendApi(kind: CollectorWorkKind, queues: CollectorQueueAvailability): boolean {
    if (!this.canSpendApiTotal()) return false
    if (kind !== 'maintenance' && !this.isActive(kind, queues)) return false
    if (this.blockedByPolicy(kind, queues)) return false

    if (!this.minimumsMetForActiveQueues(queues)) {
      return this.usedFor(kind) < this.minimumFor(kind)
    }

    return true
  }

  private selectByOverflowPriority(queues: CollectorQueueAvailability): CollectorWorkKind | null {
    if (!this.quotaPolicy) return null
    for (const kind of this.quotaPolicy.overflowPriority) {
      if (kind === 'maintenance') continue
      if (!this.canSpendApi(kind, queues)) continue
      if (this.quotaMetrics && kind === 'identity') {
        this.quotaMetrics.identityQuotaReceived += 1
      }
      this.lastOverflowKind = kind
      return kind
    }
    return null
  }

  private selectByFairScheduler(queues: CollectorQueueAvailability): CollectorWorkKind | null {
    const candidates: CollectorWorkKind[] = ['game', 'identity', 'user']
    let best: CollectorWorkKind | null = null
    let bestScore = Number.NEGATIVE_INFINITY

    for (const kind of candidates) {
      if (!this.canSpendApi(kind, queues)) continue
      const targetShare = percentForKind(this.effectivePercents, kind) / 100
      const expected = targetShare * Math.max(1, this.apiUsed)
      const shortfall = Math.max(0, this.minimumFor(kind) - this.usedFor(kind))
      const score = expected - this.usedFor(kind) + shortfall * 10
      if (score > bestScore) {
        bestScore = score
        best = kind
      }
    }

    return best
  }

  selectNextWork(queues: CollectorQueueAvailability): CollectorWorkKind | null {
    if (!this.canSpendApiTotal()) return null

    if (this.quotaPolicy && this.minimumsMetForActiveQueues(queues)) {
      return this.selectByOverflowPriority(queues)
    }

    return this.selectByFairScheduler(queues)
  }

  snapshot(queues: CollectorQueueAvailability): CollectorRunBudgetSnapshot {
    const total = Math.max(1, this.apiUsed)
    const base: CollectorRunBudgetSnapshot = {
      maxApiRequests: this.maxApiRequests,
      apiUsed: this.apiUsed,
      apiGameUsed: this.apiGameUsed,
      apiIdentityUsed: this.apiIdentityUsed,
      apiUserUsed: this.apiUserUsed,
      apiMaintenanceUsed: this.apiMaintenanceUsed,
      gameMinimum: this.minimumFor('game'),
      identityMinimum: this.minimumFor('identity'),
      userMinimum: this.minimumFor('user'),
      maintenanceMinimum: this.minimumFor('maintenance'),
      effectivePercents: this.effectivePercents,
      minimumsMet: this.minimumsMetForActiveQueues(queues),
    }

    if (!this.quotaPolicy) return base

    return {
      ...base,
      configuredPercentages: { ...this.quotaPolicy.percentages },
      effectiveApiCaps: { ...this.quotaPolicy.apiCaps },
      actualApiPercentages: {
        game: Math.round((this.apiGameUsed / total) * 1000) / 10,
        identity: Math.round((this.apiIdentityUsed / total) * 1000) / 10,
        user: Math.round((this.apiUserUsed / total) * 1000) / 10,
        maintenance: Math.round((this.apiMaintenanceUsed / total) * 1000) / 10,
      },
      quotaMetrics: this.quotaMetrics ? { ...this.quotaMetrics } : undefined,
    }
  }
}
