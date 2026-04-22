import type { FastifyPluginAsync } from 'fastify'

import { authMiddleware, resolveStubUserId } from '../middleware/auth.js'
import { apiResult } from '../types/api.js'
import { HttpError } from '../utils/httpError.js'

const searchHistoryRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/search-history',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const body = request.body
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Expected JSON object body')
      }
      const rec = body as Record<string, unknown>
      const query = rec.query
      if (typeof query !== 'string' || !query.trim()) {
        throw new HttpError(400, 'INVALID_REQUEST', 'query must be a non-empty string')
      }

      const matchedRaw = rec.matchedUserNum
      let matchedUserNum: bigint | null = null
      if (matchedRaw !== undefined && matchedRaw !== null) {
        if (
          typeof matchedRaw !== 'number' ||
          !Number.isFinite(matchedRaw) ||
          !Number.isInteger(matchedRaw)
        ) {
          throw new HttpError(400, 'INVALID_REQUEST', 'matchedUserNum must be an integer when provided')
        }
        matchedUserNum = BigInt(matchedRaw)
      }

      const userDbId = await resolveStubUserId(app.prisma, request.userId)
      await app.prisma.searchHistory.create({
        data: {
          userId: userDbId,
          query: query.trim(),
          matchedUserNum,
        },
      })
      return reply.code(204).send()
    },
  )

  app.get('/search-history', { preHandler: authMiddleware }, async (request, reply) => {
    const q = request.query as Record<string, string | undefined>
    const rawLimit = q.limit
    let limit = 20
    if (rawLimit !== undefined) {
      const n = Number.parseInt(String(rawLimit), 10)
      if (Number.isFinite(n) && n > 0) {
        limit = Math.min(50, n)
      }
    }

    const userDbId = await resolveStubUserId(app.prisma, request.userId)
    const rows = await app.prisma.searchHistory.findMany({
      where: { userId: userDbId },
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
  })
}

export default searchHistoryRoutes
