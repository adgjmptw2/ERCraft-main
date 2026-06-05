import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { authMiddleware } from '../middleware/auth.js'
import { createSearchHistoryBody, searchHistoryListQuery } from '../schemas.js'
import { apiResult } from '../types/api.js'

const DEFAULT_LIMIT = 20

const searchHistoryRoutes: FastifyPluginAsync = async (app) => {
  const withZod = app.withTypeProvider<ZodTypeProvider>()

  withZod.post(
    '/search-history',
    {
      preHandler: authMiddleware,
      schema: { body: createSearchHistoryBody },
    },
    async (request, reply) => {
      const { query, matchedUserNum } = request.body

      await app.prisma.searchHistory.create({
        data: {
          userId: request.userId,
          query: query.trim(),
          matchedUserNum:
            matchedUserNum !== undefined && matchedUserNum !== null
              ? BigInt(matchedUserNum)
              : null,
        },
      })
      return reply.code(204).send()
    },
  )

  withZod.get(
    '/search-history',
    {
      preHandler: authMiddleware,
      schema: { querystring: searchHistoryListQuery },
    },
    async (request, reply) => {
      const { limit: rawLimit } = request.query
      const limit = rawLimit ?? DEFAULT_LIMIT

      const rows = await app.prisma.searchHistory.findMany({
        where: { userId: request.userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return reply.send(
        apiResult(
          rows.map((r) => ({
            query: r.query,
            ...(r.matchedUserNum !== null ? { matchedUserNum: Number(r.matchedUserNum) } : {}),
            createdAt: r.createdAt.toISOString(),
          })),
        ),
      )
    },
  )
}

export default searchHistoryRoutes
