import type { PrismaClient } from '@prisma/client'

import { getBserRequestCount } from '../external/bserMetrics.js'
import {
  type ApiRequestCategory,
  createCollectorApiRequestMetrics,
  recordApiRequest,
  type CollectorApiRequestMetrics,
} from './apiMetrics.js'
import { canSpendCollectorRequest, waitCollectorRps } from './budget.js'
import type { CollectorConfig } from './config.js'
import {
  CollectorRunBudget,
  type CollectorQueueAvailability,
  type CollectorWorkKind,
} from './runBudget.js'

export type ApiAcquireFailure = {
  ok: false
  reason: 'max-api-requests' | 'scheduler' | 'daily-budget'
}

function workKindForCategory(category: ApiRequestCategory): CollectorWorkKind {
  switch (category) {
    case 'gameDetail':
      return 'game'
    case 'identityNicknameResolve':
    case 'identityGameVerification':
      return 'identity'
    case 'userGames':
      return 'user'
    case 'other':
      return 'maintenance'
  }
}

export interface CollectorApiPolicy {
  blockGameApi: boolean
  blockUserApi: boolean
}

export class CollectorApiBudget {
  readonly apiMetrics: CollectorApiRequestMetrics = createCollectorApiRequestMetrics()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: CollectorConfig,
    private readonly runBudget: CollectorRunBudget,
    private apiPolicy: CollectorApiPolicy = { blockGameApi: false, blockUserApi: false },
  ) {}

  updateApiPolicy(policy: CollectorApiPolicy): void {
    this.apiPolicy = policy
  }

  getApiUsed(): number {
    return this.runBudget.getApiUsed()
  }

  canSpendApiTotal(): boolean {
    return this.runBudget.canSpendApiTotal()
  }

  async acquire(
    category: ApiRequestCategory,
    queues: CollectorQueueAvailability,
  ): Promise<ApiAcquireFailure | { ok: true }> {
    const workKind = workKindForCategory(category)
    if (this.apiPolicy.blockGameApi && workKind === 'game') {
      this.runBudget.recordBlockedAttempt('game')
      return { ok: false, reason: 'scheduler' }
    }
    if (this.apiPolicy.blockUserApi && workKind === 'user') {
      this.runBudget.recordBlockedAttempt('user')
      return { ok: false, reason: 'scheduler' }
    }
    if (!this.runBudget.canSpendApi(workKind, queues)) {
      if (workKind === 'game' || workKind === 'user') {
        this.runBudget.recordBlockedAttempt(workKind)
      }
      return { ok: false, reason: 'scheduler' }
    }
    if (!(await canSpendCollectorRequest(this.prisma, this.config))) {
      return { ok: false, reason: 'daily-budget' }
    }
    await waitCollectorRps(this.config)
    return { ok: true }
  }

  async execute<T>(
    category: ApiRequestCategory,
    queues: CollectorQueueAvailability,
    call: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | ApiAcquireFailure> {
    const gate = await this.acquire(category, queues)
    if (!gate.ok) return gate

    const before = getBserRequestCount()
    const value = await call()
    const delta = getBserRequestCount() - before
    const charge = delta > 0 ? delta : 1
    const workKind = workKindForCategory(category)

    this.runBudget.recordApi(workKind, charge)
    recordApiRequest(this.apiMetrics, category, Math.min(1, charge))
    if (charge > 1) {
      recordApiRequest(this.apiMetrics, 'other', charge - 1)
    }

    return { ok: true, value }
  }
}
