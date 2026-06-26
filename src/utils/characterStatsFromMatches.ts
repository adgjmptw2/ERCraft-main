import {
  buildCharacterAnalysisReports,
  type BuildCharacterReportsOptions,
} from '@/analysis/characterReport'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { MatchSummary } from '@/types/match'
import { resolveCharacterDisplayName } from '@/utils/gameLabels'
import { isRankGameMode, resolveGameMode } from '@/utils/gameMode'

const PROFILE_MIN_GRADE_MATCHES = 3

/** 프로필 캐릭터 통계 — 랭크 경기만 */
export function filterProfileCharacterStatMatches(
  matches: ReadonlyArray<MatchSummary>,
): MatchSummary[] {
  return matches.filter((match) => isRankGameMode(resolveGameMode(match)))
}

/** 선택 시즌 매치만 (seasonNumber 미기재 시 fallback) */
export function filterSeasonMatches<T extends MatchSummary>(
  matches: ReadonlyArray<T>,
  seasonNumber: number,
  seasonFallback: number,
): T[] {
  const filtered = matches.filter((match) => (match.seasonNumber ?? seasonFallback) === seasonNumber)
  if (filtered.length === 0 && seasonNumber === seasonFallback) {
    return [...matches]
  }
  return filtered
}

/** 전적 목록 — 최신 경기 우선 */
export function sortMatchesByDateDesc<T extends { gameStartedAt: string }>(
  matches: ReadonlyArray<T>,
): T[] {
  return [...matches].sort(
    (a, b) => new Date(b.gameStartedAt).getTime() - new Date(a.gameStartedAt).getTime(),
  )
}

/** 프로필 캐릭터 통계 — characterNum 우선 groupBy, 시즌 랭크 매치만 */
export function buildProfileCharacterReports(
  matches: ReadonlyArray<MatchSummary>,
): CharacterAnalysisReport[] {
  const rankMatches = filterProfileCharacterStatMatches(matches)
  if (rankMatches.length === 0) return []

  const options: BuildCharacterReportsOptions = {
    groupBy: 'character',
    minGradeMatches: PROFILE_MIN_GRADE_MATCHES,
    feedbackContext: 'profile',
  }

  const localized = rankMatches.map((match) => ({
    ...match,
    characterName: resolveCharacterDisplayName(match.characterNum, match.characterName),
  }))

  return buildCharacterAnalysisReports([...localized], options)
}

export function profileCharacterStatsBasisLabel(matchCount: number): string {
  return `최근 ${matchCount}경기 기준`
}
