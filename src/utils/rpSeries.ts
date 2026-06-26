import type { RpTrendPoint } from '@/mocks/loader'
import { buildRpTrendPointsFromMatches, RP_TREND_DESCRIPTION } from '@/utils/rpTrendPoints'

export type RpChartState = 'ready' | 'insufficientData' | 'unavailable'

export interface RpMatchRow {
  matchId: string
  gameStartedAt: string
  rpAfter?: number
  rpDelta?: number
}

export interface RpChartViewModel {
  state: RpChartState
  points: RpTrendPoint[]
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
}

export const RP_MATCH_SERIES_LIMIT = 20

function isValidRp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** KST 기준 M/D 라벨 */
export function shortRpDateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** real 모드 — 경기별 RP 시계열 (시간순, 누락 경기 제외) */
export function buildRpMatchSeriesFromMatches(
  matches: ReadonlyArray<RpMatchRow>,
  formatDate: (iso: string) => string,
  limit = RP_MATCH_SERIES_LIMIT,
): RpTrendPoint[] {
  const withRp = matches
    .filter((m): m is RpMatchRow & { rpAfter: number } => isValidRp(m.rpAfter))
    .sort((a, b) => new Date(a.gameStartedAt).getTime() - new Date(b.gameStartedAt).getTime())

  return withRp.slice(-limit).map((match) => ({
    matchId: match.matchId,
    dateLabel: formatDate(match.gameStartedAt),
    rpAfter: match.rpAfter,
    rpDelta: match.rpDelta,
    gamesPlayed: 1,
  }))
}

export function getRpChartState(
  matches: ReadonlyArray<RpMatchRow>,
  points: RpTrendPoint[],
): RpChartState {
  const hasAnyRp = matches.some((m) => isValidRp(m.rpAfter))
  if (!hasAnyRp) return 'unavailable'
  if (points.length < 2) return 'insufficientData'
  return 'ready'
}

export function buildRealModeRpChartViewModel(
  matches: ReadonlyArray<RpMatchRow>,
  formatDate: (iso: string) => string = shortRpDateLabel,
): RpChartViewModel {
  const points = buildRpTrendPointsFromMatches(matches, formatDate)
  const state = points.length >= 2 ? 'ready' : getRpChartState(matches, points)

  return {
    state,
    points,
    title: 'RP 추이',
    description: RP_TREND_DESCRIPTION,
    emptyTitle:
      state === 'unavailable' ? 'RP 흐름 데이터 없음' : '랭크 전적이 있는 날이 충분하지 않습니다.',
    emptyDescription:
      state === 'unavailable'
        ? '조회된 경기에 RP 기록이 없습니다.'
        : '최근 경기별 RP 기록이 충분하지 않습니다.',
  }
}

export function buildMockModeRpChartViewModel(
  matches: ReadonlyArray<RpMatchRow>,
  formatDate: (iso: string) => string = shortRpDateLabel,
): RpChartViewModel {
  const points = buildRpTrendPointsFromMatches(matches, formatDate)
  const state = points.length >= 2 ? 'ready' : getRpChartState(matches, points)

  return {
    state,
    points,
    title: 'RP 추이',
    description: RP_TREND_DESCRIPTION,
    emptyTitle: 'RP 흐름 데이터 없음',
    emptyDescription: '최근 경기 RP 기록이 없습니다.',
  }
}
