export const MATCH_HISTORY_MODES = ['all', 'rank', 'normal', 'cobalt', 'union'] as const

export type MatchHistoryMode = (typeof MATCH_HISTORY_MODES)[number]

export const MATCH_HISTORY_MODE_LABELS: Record<MatchHistoryMode, string> = {
  all: '전체',
  rank: '랭크',
  normal: '일반',
  cobalt: '코발트',
  union: '유니온',
}

export function isMatchHistoryMode(value: string): value is MatchHistoryMode {
  return (MATCH_HISTORY_MODES as readonly string[]).includes(value)
}

export function isCobaltMatchHistoryMode(value: MatchHistoryMode): boolean {
  return value === 'cobalt'
}

/** DB-first mode tab empty state. `all` is a UI aggregate option, not a stored mode. */
export const MATCH_HISTORY_MODE_EMPTY_MESSAGE = '해당 모드 전적이 없습니다.'
export const UNION_MATCHES_UNSUPPORTED_MESSAGE = MATCH_HISTORY_MODE_EMPTY_MESSAGE

/** @deprecated mode별 서버 query 제거 — matchHistoryFilteredEmptyMessage 사용 */
export function matchHistoryEmptyMessage(mode: MatchHistoryMode): string | null {
  return matchHistoryFilteredEmptyMessage(mode)
}

/** 클라이언트 필터 결과가 비었을 때 즉시 안내 (추가 fetch 없음) */
export function matchHistoryFilteredEmptyMessage(mode: MatchHistoryMode): string | null {
  if (mode === 'all') return null
  return MATCH_HISTORY_MODE_EMPTY_MESSAGE
}
