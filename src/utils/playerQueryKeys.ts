import type { MatchHistoryMode } from '@/types/matchMode'

/** React Query — 플레이어 프로필 queryKey factory (owner scope 기준) */
export type PlayerDataSource = 'demo' | 'real'

export interface PlayerQueryOwnerScope {
  nickname: string
  userNum?: number | null
  dataSource: PlayerDataSource
}

export function normalizePlayerNickname(nickname: string): string {
  return nickname.trim()
}

export function playerQueryOwnerScope(input: {
  nickname: string
  userNum?: number | null
  dataSource: PlayerDataSource
}): PlayerQueryOwnerScope {
  return {
    nickname: normalizePlayerNickname(input.nickname),
    userNum: input.userNum,
    dataSource: input.dataSource,
  }
}

/** dataSource + canonicalUid (+ pending nickname before UID resolves) */
export function playerCacheOwnerSegment(scope: PlayerQueryOwnerScope): string {
  const term = normalizePlayerNickname(scope.nickname)
  const uid = scope.userNum
  if (uid != null && Number.isFinite(uid) && uid > 0) {
    return `${scope.dataSource}:${uid}`
  }
  return `${scope.dataSource}:pending:${term}`
}

export const playerQueryKeys = {
  all: ['player'] as const,

  root: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.all, playerCacheOwnerSegment(scope)] as const,

  summary: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.root(scope), 'summary'] as const,

  stats: (scope: PlayerQueryOwnerScope) => [...playerQueryKeys.root(scope), 'stats'] as const,

  statsDto: (scope: PlayerQueryOwnerScope, tier = '') =>
    [...playerQueryKeys.root(scope), 'stats-dto', tier] as const,

  statsDtoPrefix: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.root(scope), 'stats-dto'] as const,

  seasons: (scope: PlayerQueryOwnerScope, from: number, to: number) =>
    [...playerQueryKeys.root(scope), 'seasons', from, to] as const,

  seasonsPrefix: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.root(scope), 'seasons'] as const,

  seasonAggregate: (scope: PlayerQueryOwnerScope, seasonId: number) =>
    [...playerQueryKeys.root(scope), 'season-aggregate', seasonId] as const,

  analysis: (scope: PlayerQueryOwnerScope, seasonId: number, analysisScope = 'all') =>
    [...playerQueryKeys.root(scope), 'analysis', seasonId, analysisScope] as const,

  analysisPrefix: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.root(scope), 'analysis'] as const,

  matches: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.root(scope), 'matches'] as const,

  /** infinite query — current season DB-first matches by canonical mode */
  matchesDto: (scope: PlayerQueryOwnerScope, pageSize = 10, matchMode: MatchHistoryMode = 'all') =>
    [...playerQueryKeys.root(scope), 'matches-dto', matchMode, pageSize] as const,

  matchesDtoPrefix: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.root(scope), 'matches-dto'] as const,

  /** summary·stats·matches 첫 페이지·현재 시즌 등 최초 프로필 로드 묶음 */
  profileInitial: (scope: PlayerQueryOwnerScope) =>
    [...playerQueryKeys.root(scope), 'profile-initial'] as const,
}
