import type { RpTrendPoint } from '@/mocks/loader'

/** RP 추이 그래프 — 랭크 전적이 있는 최근 N일(일별 마무리 RP) */
export const RP_TREND_RECENT_LIMIT = 7

export const RP_TREND_DESCRIPTION = `랭크 전적이 있는 최근 ${RP_TREND_RECENT_LIMIT}일 마무리 RP`

interface RpMatchRow {
  matchId: string
  gameStartedAt: string
  rpAfter?: number
  rpDelta?: number
}

/** KST(Asia/Seoul) 기준 일자 — 하루 단위 체크포인트 */
function kstDayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

/** 같은 날 여러 판 → 마무리 RP 1점. 경기 없는 달력일은 제외, 랭크 친 날만 최근 7일 */
export function buildRpTrendPointsFromMatches(
  matches: ReadonlyArray<RpMatchRow>,
  formatDate: (iso: string) => string,
): RpTrendPoint[] {
  const withRp = matches.filter((m): m is RpMatchRow & { rpAfter: number } => m.rpAfter != null)
  if (withRp.length === 0) return []

  const byDay = new Map<string, (RpMatchRow & { rpAfter: number })[]>()
  for (const match of withRp) {
    const key = kstDayKey(match.gameStartedAt)
    const bucket = byDay.get(key) ?? []
    bucket.push(match)
    byDay.set(key, bucket)
  }

  const dayPoints = [...byDay.entries()]
    .map(([dayKey, dayMatches]) => {
      const chronological = [...dayMatches].sort(
        (a, b) => new Date(a.gameStartedAt).getTime() - new Date(b.gameStartedAt).getTime(),
      )
      const closing = chronological.at(-1)!
      const rpValues = chronological.map((m) => m.rpAfter)

      return {
        dayKey,
        point: {
          matchId: `rp-day-${dayKey}`,
          dateLabel: formatDate(closing.gameStartedAt),
          rpAfter: closing.rpAfter,
          rpDelta: closing.rpDelta,
          dayMinRp: Math.min(...rpValues),
          dayMaxRp: Math.max(...rpValues),
          gamesPlayed: chronological.length,
        } satisfies RpTrendPoint,
      }
    })
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))

  return dayPoints.slice(-RP_TREND_RECENT_LIMIT).map((entry) => entry.point)
}
