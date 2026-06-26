import { z } from 'zod'

export const createFavoriteBody = z.object({
  playerUserNum: z.number().int().positive(),
  nicknameSnapshot: z.string().trim().min(1).max(50),
})

export const createSearchHistoryBody = z.object({
  query: z.string().trim().min(1),
  matchedUserNum: z.number().int().positive().optional().nullable(),
})

export const searchHistoryListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

/** 검색 쿼리 — q 또는 nickname (정확 일치 조회) */
export const playerSearchQuery = z.object({
  q: z.string().trim().max(50).optional(),
  nickname: z.string().trim().max(50).optional(),
})

export function resolvePlayerSearchTerm(query: {
  q?: string
  nickname?: string
}): string {
  return (query.q ?? query.nickname ?? '').trim()
}

export const playerNicknameParams = z.object({
  nickname: z.string().trim().min(1).max(50),
})

export const gameIdParams = z.object({
  gameId: z.string().trim().regex(/^\d{1,20}$/, 'gameId must be numeric'),
})

/** 프로필 route — 검색에서 선택한 userNum/uid 우선 (nickname uidCache보다 앞선다) */
export const playerIdentityQuery = z.object({
  userNum: z.coerce.number().int().positive().optional(),
  uid: z.string().trim().min(1).max(64).optional(),
})

/** 명시적 전적 갱신 — true일 때만 upstream 최신 확인 */
export const profileRefreshQuery = z.object({
  refresh: z.coerce.boolean().optional(),
})

export const matchesQuery = z
  .object({
    page: z.coerce.number().int().min(0).default(0),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    mode: z.enum(['all', 'rank', 'normal', 'cobalt', 'union']).default('all'),
    matchMode: z.enum(['all', 'rank', 'normal', 'cobalt', 'union']).optional(),
  })
  .merge(playerIdentityQuery)
  .merge(profileRefreshQuery)

export const seasonIdQuery = z
  .object({
    seasonId: z.coerce.number().int().min(1).max(99).optional(),
  })
  .merge(playerIdentityQuery)
  .merge(profileRefreshQuery)

export const playerAnalysisQuery = z
  .object({
    seasonId: z.coerce.number().int().min(1).max(99).optional(),
    scope: z.enum(['all', 'rank']).default('rank'),
  })
  .merge(playerIdentityQuery)
  .merge(profileRefreshQuery)

export const seasonsQuery = z
  .object({
    from: z.coerce.number().int().min(1).max(99).optional(),
    to: z.coerce.number().int().min(1).max(99).optional(),
  })
  .merge(playerIdentityQuery)
  .merge(profileRefreshQuery)
