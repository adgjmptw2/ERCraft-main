/** 마지막 갱신 시각 — 상대/날짜 한국어 라벨 */
export function formatRefreshTimeLabel(
  refreshedAt: Date,
  now: Date = new Date(),
): string {
  const at = refreshedAt.getTime()
  if (!Number.isFinite(at)) return '갱신 기록 없음'

  const diffMs = now.getTime() - at
  if (diffMs < 0) return '방금 갱신'

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return '방금 갱신'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}분 전 갱신`

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전 갱신`

  const diffDay = Math.floor(diffHour / 24)
  if (diffDay <= 6) return `${diffDay}일 전 갱신`

  if (refreshedAt.getFullYear() === now.getFullYear()) {
    return `${refreshedAt.getMonth() + 1}월 ${refreshedAt.getDate()}일 갱신`
  }

  return `${refreshedAt.getFullYear()}년 ${refreshedAt.getMonth() + 1}월 ${refreshedAt.getDate()}일 갱신`
}

export function parseRefreshTimestamp(value: string | Date | null | undefined): Date | null {
  if (value == null) return null
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

/** 갱신(저장) vs 확인 시각 — 사용자 혼동 최소화 */
export function formatProfileFreshnessLabel(
  lastRefreshedAt: Date | null,
  lastCheckedAt: Date | null,
  now: Date = new Date(),
): string | null {
  const refreshedMs = lastRefreshedAt?.getTime() ?? Number.NEGATIVE_INFINITY
  const checkedMs = lastCheckedAt?.getTime() ?? Number.NEGATIVE_INFINITY

  if (!Number.isFinite(refreshedMs) && !Number.isFinite(checkedMs)) {
    return null
  }

  if (refreshedMs >= checkedMs && lastRefreshedAt) {
    return formatRefreshTimeLabel(lastRefreshedAt, now)
  }

  if (lastCheckedAt) {
    const diffMs = now.getTime() - lastCheckedAt.getTime()
    if (diffMs < 60_000) return '방금 확인'
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 60) return `${diffMin}분 전 확인`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour}시간 전 확인`
    const diffDay = Math.floor(diffHour / 24)
    if (diffDay <= 6) return `${diffDay}일 전 확인`
    if (lastCheckedAt.getFullYear() === now.getFullYear()) {
      return `${lastCheckedAt.getMonth() + 1}월 ${lastCheckedAt.getDate()}일 확인`
    }
    return `${lastCheckedAt.getFullYear()}년 ${lastCheckedAt.getMonth() + 1}월 ${lastCheckedAt.getDate()}일 확인`
  }

  return lastRefreshedAt ? formatRefreshTimeLabel(lastRefreshedAt, now) : null
}
