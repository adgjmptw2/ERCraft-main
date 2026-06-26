export type ApiRequestCategory =
  | 'gameDetail'
  | 'identityNicknameResolve'
  | 'identityGameVerification'
  | 'userGames'
  | 'other'

export interface CollectorApiRequestMetrics {
  total: number
  gameDetail: number
  identityNicknameResolve: number
  identityGameVerification: number
  userGames: number
  other: number
}

export function createCollectorApiRequestMetrics(): CollectorApiRequestMetrics {
  return {
    total: 0,
    gameDetail: 0,
    identityNicknameResolve: 0,
    identityGameVerification: 0,
    userGames: 0,
    other: 0,
  }
}

export function recordApiRequest(
  metrics: CollectorApiRequestMetrics,
  category: ApiRequestCategory,
  count = 1,
): void {
  if (count <= 0) return
  metrics.total += count
  switch (category) {
    case 'gameDetail':
      metrics.gameDetail += count
      break
    case 'identityNicknameResolve':
      metrics.identityNicknameResolve += count
      break
    case 'identityGameVerification':
      metrics.identityGameVerification += count
      break
    case 'userGames':
      metrics.userGames += count
      break
    case 'other':
      metrics.other += count
      break
  }
}

export function validateApiRequestMetrics(metrics: CollectorApiRequestMetrics): boolean {
  const sum =
    metrics.gameDetail +
    metrics.identityNicknameResolve +
    metrics.identityGameVerification +
    metrics.userGames +
    metrics.other
  return metrics.total === sum
}

export type CollectorWorkKind = 'game' | 'identity' | 'user' | 'maintenance'

export interface CollectorWorkMetrics {
  claimed: number
  completed: number
  skipped: number
  retried: number
  dead: number
  gameJobs: number
  identityJobs: number
  userJobs: number
  maintenanceJobs: number
}

export function createCollectorWorkMetrics(): CollectorWorkMetrics {
  return {
    claimed: 0,
    completed: 0,
    skipped: 0,
    retried: 0,
    dead: 0,
    gameJobs: 0,
    identityJobs: 0,
    userJobs: 0,
    maintenanceJobs: 0,
  }
}

export function recordWorkClaimed(metrics: CollectorWorkMetrics, kind: CollectorWorkKind): void {
  metrics.claimed += 1
  if (kind === 'game') metrics.gameJobs += 1
  if (kind === 'identity') metrics.identityJobs += 1
  if (kind === 'user') metrics.userJobs += 1
  if (kind === 'maintenance') metrics.maintenanceJobs += 1
}

export function recordWorkCompleted(metrics: CollectorWorkMetrics): void {
  metrics.completed += 1
}

export function recordWorkSkipped(metrics: CollectorWorkMetrics): void {
  metrics.skipped += 1
  metrics.completed += 1
}

export interface CollectorNoApiMetrics {
  bindingHit: number
  nicknameCacheHit: number
  notFoundCacheHit: number
  ambiguousCacheHit: number
  dbCompleteGameSkip: number
  duplicateQueueSkip: number
  alreadyResolvedIdentitySkip: number
}

export function createCollectorNoApiMetrics(): CollectorNoApiMetrics {
  return {
    bindingHit: 0,
    nicknameCacheHit: 0,
    notFoundCacheHit: 0,
    ambiguousCacheHit: 0,
    dbCompleteGameSkip: 0,
    duplicateQueueSkip: 0,
    alreadyResolvedIdentitySkip: 0,
  }
}
