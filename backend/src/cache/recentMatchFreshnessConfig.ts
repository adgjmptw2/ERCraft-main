/** stale-while-revalidate — 최근 경기 확인 성공 TTL (기본 15분) */
export const DEFAULT_RECENT_MATCH_CHECK_TTL_MS = 15 * 60_000

/** SWR 실패 후 재시도 cooldown (기본 5분) */
export const DEFAULT_RECENT_MATCH_FAILURE_COOLDOWN_MS = 5 * 60_000

const MIN_SUCCESS_TTL_MS = 60_000
const MIN_FAILURE_COOLDOWN_MS = 60_000

export function resolveRecentMatchCheckTtlMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.RECENT_MATCH_CHECK_TTL_MS
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_RECENT_MATCH_CHECK_TTL_MS
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < MIN_SUCCESS_TTL_MS) {
    return DEFAULT_RECENT_MATCH_CHECK_TTL_MS
  }
  return parsed
}

export function resolveRecentMatchFailureCooldownMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.RECENT_MATCH_CHECK_FAILURE_COOLDOWN_MS
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_RECENT_MATCH_FAILURE_COOLDOWN_MS
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < MIN_FAILURE_COOLDOWN_MS) {
    return DEFAULT_RECENT_MATCH_FAILURE_COOLDOWN_MS
  }
  return parsed
}

export function isRecentMatchCheckStale(
  lastCheckedAt: Date | null | undefined,
  now: Date,
  ttlMs = resolveRecentMatchCheckTtlMs(),
): boolean {
  if (!lastCheckedAt) return true
  return now.getTime() - lastCheckedAt.getTime() >= ttlMs
}

export function isRecentMatchCheckInCooldown(
  nextRetryAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!nextRetryAt) return false
  return nextRetryAt.getTime() > now.getTime()
}
