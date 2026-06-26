export interface CollectorConfig {
  enabled: boolean
  maxRps: number
  dailyBudget: number
  interactiveReservePercent: number
  userPageLimit: number
  maxDiscoveryDepth: number
  maxRetries: number
  leaseSeconds: number
  workerId: string
  identityEnabled: boolean
  gameBudgetPercent: number
  identityBudgetPercent: number
  userBudgetPercent: number
  maintenanceBudgetPercent: number
  identityQuickPages: number
  identityNormalPages: number
  identityDeepPages: number
  identityDeepEnabled: boolean
  identityDeepPriorityThreshold: number
  identityMaxRetries: number
  maxWorkIterationsMultiplier: number
  priorityRefreshBatchSize: number
  priorityRefreshIntervalMinutes: number
  identityBacklogSoftLimit: number
  identityBacklogHardLimit: number
  identityBacklogSoftEnter: number
  identityBacklogSoftExit: number
  identityBacklogHardEnter: number
  identityBacklogHardExit: number
  identityBacklogSoftGamePercent: number
  identityBacklogSoftIdentityPercent: number
  identityBacklogHardGamePercent: number
  identityBacklogHardIdentityPercent: number
  identityDeferNicknamePendingLimit: number
  identityGroupSize: number
  identityGroupMaxSourceGames: number
  identityResolveBatchSize: number
  identityOldSourceDeferDays: number
  modeBalancedEnterPending: number
  modeBalancedExitPending: number
  modeDrainEnterPending: number
  modeDrainExitPending: number
  modeEmergencyEnterPending: number
  modeEmergencyExitPending: number
  modeGrowthDrainRatio: number
  modeGrowthEmergencyRatio: number
  modeMinDurationSeconds: number
  modeStableGrowthPercent: number
  modeRunGrowthEmergencyPercent: number
  identityQueueHardCap: number
  drainDeepMinResolvedPerPage: number
  drainDeepMaxApiPercent: number
  drainGameApiMaxPercent: number
  drainUserApiMaxPercent: number
  balancedStabilitySafetyFactor: number
  balancedGameApiMaxPercent: number
  balancedUserApiMaxPercent: number
  balancedMinIdentityPercent: number
  balancedObservationMinSamples: number
  balancedEwmaAlpha: number
  balancedMaxCapIncreasePerRunPercent: number
  identityCompactionBatchSize: number
}

const DAILY_BUDGET_HARD_LIMIT = 800_000

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  return raw === 'true' || raw === '1'
}

import { validateOperationModeThresholds, loadOperationModeThresholds } from './operationMode.js'

export function validateCollectorBudgetPercents(config: Pick<
  CollectorConfig,
  'gameBudgetPercent' | 'identityBudgetPercent' | 'userBudgetPercent' | 'maintenanceBudgetPercent'
>): void {
  const sum =
    config.gameBudgetPercent +
    config.identityBudgetPercent +
    config.userBudgetPercent +
    config.maintenanceBudgetPercent
  if (sum !== 100) {
    throw new Error(
      `Collector budget percents must sum to 100 (got ${sum}: game=${config.gameBudgetPercent}, identity=${config.identityBudgetPercent}, user=${config.userBudgetPercent}, maintenance=${config.maintenanceBudgetPercent})`,
    )
  }
}

export function validateIdentityPagePolicy(config: Pick<
  CollectorConfig,
  'identityQuickPages' | 'identityNormalPages' | 'identityDeepPages'
>): void {
  if (config.identityQuickPages > config.identityNormalPages) {
    throw new Error('COLLECTOR_IDENTITY_QUICK_PAGES must be <= COLLECTOR_IDENTITY_NORMAL_PAGES')
  }
  if (config.identityNormalPages > config.identityDeepPages) {
    throw new Error('COLLECTOR_IDENTITY_NORMAL_PAGES must be <= COLLECTOR_IDENTITY_DEEP_PAGES')
  }
}

export function loadCollectorConfig(overrides: Partial<CollectorConfig> = {}): CollectorConfig {
  const dailyBudget = Math.floor(readNumber('COLLECTOR_DAILY_BUDGET', 20_000))
  if (dailyBudget > DAILY_BUDGET_HARD_LIMIT) {
    throw new Error(`COLLECTOR_DAILY_BUDGET exceeds hard limit ${DAILY_BUDGET_HARD_LIMIT}`)
  }

  const gameBudgetPercent = Math.max(0, Math.min(100, readNumber('COLLECTOR_GAME_BUDGET_PERCENT', 50)))
  const identityBudgetPercent = Math.max(
    0,
    Math.min(100, readNumber('COLLECTOR_IDENTITY_BUDGET_PERCENT', 25)),
  )
  const userBudgetPercent = Math.max(0, Math.min(100, readNumber('COLLECTOR_USER_BUDGET_PERCENT', 20)))
  const maintenanceBudgetPercent = Math.max(
    0,
    Math.min(100, readNumber('COLLECTOR_MAINTENANCE_BUDGET_PERCENT', 5)),
  )

  const identityQuickPages = Math.max(1, Math.floor(readNumber('COLLECTOR_IDENTITY_QUICK_PAGES', 1)))
  const identityNormalPages = Math.max(
    identityQuickPages,
    Math.floor(readNumber('COLLECTOR_IDENTITY_NORMAL_PAGES', 3)),
  )
  const identityDeepPages = Math.max(
    identityNormalPages,
    Math.floor(
      readNumber(
        'COLLECTOR_IDENTITY_DEEP_PAGES',
        readNumber('COLLECTOR_IDENTITY_VERIFY_GAME_LIMIT', 20),
      ),
    ),
  )

  const config: CollectorConfig = {
    enabled: readBoolean('COLLECTOR_ENABLED', false),
    maxRps: Math.max(0.1, Math.min(readNumber('COLLECTOR_MAX_RPS', 1), 1)),
    dailyBudget: Math.max(0, dailyBudget),
    interactiveReservePercent: Math.max(
      0,
      Math.min(90, readNumber('COLLECTOR_INTERACTIVE_RESERVE_PERCENT', 30)),
    ),
    userPageLimit: Math.max(1, Math.floor(readNumber('COLLECTOR_USER_PAGE_LIMIT', 1))),
    maxDiscoveryDepth: Math.max(0, Math.floor(readNumber('COLLECTOR_MAX_DISCOVERY_DEPTH', 20))),
    maxRetries: Math.max(0, Math.floor(readNumber('COLLECTOR_MAX_RETRIES', 5))),
    leaseSeconds: Math.max(15, Math.floor(readNumber('COLLECTOR_LEASE_SECONDS', 120))),
    workerId:
      process.env.COLLECTOR_WORKER_ID ??
      `collector-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    identityEnabled: readBoolean('COLLECTOR_IDENTITY_ENABLED', true),
    gameBudgetPercent,
    identityBudgetPercent,
    userBudgetPercent,
    maintenanceBudgetPercent,
    identityQuickPages,
    identityNormalPages,
    identityDeepPages,
    identityDeepEnabled: readBoolean('COLLECTOR_IDENTITY_DEEP_ENABLED', true),
    identityDeepPriorityThreshold: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_IDENTITY_DEEP_PRIORITY_THRESHOLD', 80)),
    ),
    identityMaxRetries: Math.max(0, Math.floor(readNumber('COLLECTOR_IDENTITY_MAX_RETRIES', 3))),
    maxWorkIterationsMultiplier: Math.max(
      1,
      Math.floor(readNumber('COLLECTOR_MAX_WORK_ITERATIONS_MULTIPLIER', 20)),
    ),
    priorityRefreshBatchSize: Math.max(
      1,
      Math.floor(readNumber('COLLECTOR_PRIORITY_REFRESH_BATCH_SIZE', 500)),
    ),
    priorityRefreshIntervalMinutes: Math.max(
      1,
      Math.floor(readNumber('COLLECTOR_PRIORITY_REFRESH_INTERVAL_MINUTES', 60)),
    ),
    identityBacklogSoftLimit: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_IDENTITY_BACKLOG_SOFT_LIMIT', 5000)),
    ),
    identityBacklogHardLimit: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_IDENTITY_BACKLOG_HARD_LIMIT', 15000)),
    ),
    identityBacklogSoftEnter: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_IDENTITY_BACKLOG_SOFT_LIMIT', 5000)),
    ),
    identityBacklogSoftExit: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_IDENTITY_BACKLOG_SOFT_EXIT', 4000)),
    ),
    identityBacklogHardEnter: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_IDENTITY_BACKLOG_HARD_LIMIT', 15000)),
    ),
    identityBacklogHardExit: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_IDENTITY_BACKLOG_HARD_EXIT', 12000)),
    ),
    identityBacklogSoftGamePercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_GAME_BACKLOG_SOFT_PERCENT', 35)),
    ),
    identityBacklogSoftIdentityPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_IDENTITY_BACKLOG_SOFT_PERCENT', 40)),
    ),
    identityBacklogHardGamePercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_GAME_BACKLOG_HARD_PERCENT', 20)),
    ),
    identityBacklogHardIdentityPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_IDENTITY_BACKLOG_HARD_PERCENT', 55)),
    ),
    identityDeferNicknamePendingLimit: Math.max(
      1,
      Math.floor(readNumber('COLLECTOR_IDENTITY_DEFER_NICKNAME_PENDING_LIMIT', 12)),
    ),
    identityGroupSize: Math.max(
      1,
      Math.min(25, Math.floor(readNumber('COLLECTOR_IDENTITY_GROUP_SIZE', 25))),
    ),
    identityGroupMaxSourceGames: Math.max(
      1,
      Math.min(25, Math.floor(readNumber('COLLECTOR_IDENTITY_GROUP_MAX_SOURCE_GAMES', 25))),
    ),
    identityResolveBatchSize: Math.max(
      1,
      Math.min(25, Math.floor(readNumber('COLLECTOR_IDENTITY_RESOLVE_BATCH_SIZE', 25))),
    ),
    identityOldSourceDeferDays: Math.max(
      90,
      Math.floor(readNumber('COLLECTOR_IDENTITY_OLD_SOURCE_DEFER_DAYS', 180)),
    ),
    modeBalancedEnterPending: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_MODE_BALANCED_ENTER_PENDING', 5000)),
    ),
    modeBalancedExitPending: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_MODE_BALANCED_EXIT_PENDING', 3500)),
    ),
    modeDrainEnterPending: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_MODE_DRAIN_ENTER_PENDING', 10000)),
    ),
    modeDrainExitPending: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_MODE_DRAIN_EXIT_PENDING', 7000)),
    ),
    modeEmergencyEnterPending: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_MODE_EMERGENCY_ENTER_PENDING', 20000)),
    ),
    modeEmergencyExitPending: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_MODE_EMERGENCY_EXIT_PENDING', 14000)),
    ),
    modeGrowthDrainRatio: Math.max(1, readNumber('COLLECTOR_MODE_GROWTH_DRAIN_RATIO', 2)),
    modeGrowthEmergencyRatio: Math.max(1, readNumber('COLLECTOR_MODE_GROWTH_EMERGENCY_RATIO', 5)),
    modeMinDurationSeconds: Math.max(
      0,
      Math.floor(readNumber('COLLECTOR_MODE_MIN_DURATION_SECONDS', 300)),
    ),
    modeStableGrowthPercent: Math.max(
      0,
      readNumber('COLLECTOR_MODE_STABLE_GROWTH_PERCENT', 1),
    ),
    modeRunGrowthEmergencyPercent: Math.max(
      0,
      readNumber('COLLECTOR_MODE_RUN_GROWTH_EMERGENCY_PERCENT', 25),
    ),
    identityQueueHardCap: Math.max(
      1,
      Math.floor(readNumber('COLLECTOR_IDENTITY_QUEUE_HARD_CAP', 100_000)),
    ),
    drainDeepMinResolvedPerPage: Math.max(
      0,
      readNumber('COLLECTOR_DRAIN_DEEP_MIN_RESOLVED_PER_PAGE', 0.25),
    ),
    drainDeepMaxApiPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_DRAIN_DEEP_MAX_API_PERCENT', 20)),
    ),
    drainGameApiMaxPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_DRAIN_GAME_API_MAX_PERCENT', 5)),
    ),
    drainUserApiMaxPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_DRAIN_USER_API_MAX_PERCENT', 5)),
    ),
    balancedStabilitySafetyFactor: Math.max(
      0.5,
      Math.min(1, readNumber('COLLECTOR_BALANCED_STABILITY_SAFETY_FACTOR', 0.9)),
    ),
    balancedGameApiMaxPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_BALANCED_GAME_API_MAX_PERCENT', 25)),
    ),
    balancedUserApiMaxPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_BALANCED_USER_API_MAX_PERCENT', 15)),
    ),
    balancedMinIdentityPercent: Math.max(
      0,
      Math.min(100, readNumber('COLLECTOR_BALANCED_MIN_IDENTITY_PERCENT', 55)),
    ),
    balancedObservationMinSamples: Math.max(
      1,
      Math.floor(readNumber('COLLECTOR_BALANCED_OBSERVATION_MIN_SAMPLES', 3)),
    ),
    balancedEwmaAlpha: Math.max(
      0.05,
      Math.min(1, readNumber('COLLECTOR_BALANCED_EWMA_ALPHA', 0.25)),
    ),
    balancedMaxCapIncreasePerRunPercent: Math.max(
      0,
      Math.min(25, readNumber('COLLECTOR_BALANCED_MAX_CAP_INCREASE_PER_RUN_PERCENT', 1)),
    ),
    identityCompactionBatchSize: Math.max(
      1,
      Math.floor(readNumber('COLLECTOR_IDENTITY_COMPACTION_BATCH_SIZE', 500)),
    ),
    ...overrides,
  }

  validateCollectorBudgetPercents(config)
  validateIdentityPagePolicy(config)
  validateOperationModeThresholds(loadOperationModeThresholds(config))
  return config
}

export function collectorUsableDailyBudget(config: CollectorConfig): number {
  const reserve = Math.ceil(config.dailyBudget * (config.interactiveReservePercent / 100))
  return Math.max(0, config.dailyBudget - reserve)
}
