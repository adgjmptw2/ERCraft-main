import { formatRefreshTimeLabel } from '@/utils/refreshTimeLabel'

export { formatRefreshTimeLabel, parseRefreshTimestamp } from '@/utils/refreshTimeLabel'

/** @deprecated refreshTimeLabel 사용 */
export function formatLastRefreshedAt(at: Date, now: Date = new Date()): string {
  return formatRefreshTimeLabel(at, now)
}
