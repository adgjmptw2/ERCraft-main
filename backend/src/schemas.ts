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
  limit: z.coerce.number().int().positive().optional(),
})
