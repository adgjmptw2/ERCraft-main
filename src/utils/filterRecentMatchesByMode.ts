import type { MatchSummaryDTO } from '@/types/match'
import type { MatchHistoryMode } from '@/types/matchMode'
import { resolveGameMode } from '@/utils/gameMode'

/** 최근 전적 UI mode — 이미 로드된 목록만 클라이언트 필터 */
export function filterRecentMatchesByMode(
  matches: ReadonlyArray<MatchSummaryDTO>,
  mode: MatchHistoryMode,
): MatchSummaryDTO[] {
  if (mode === 'all') return [...matches]
  return matches.filter((match) => resolveGameMode(match) === mode)
}
