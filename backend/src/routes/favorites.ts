import { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'

import { authMiddleware, resolveStubUserId } from '../middleware/auth.js'
import { apiResult } from '../types/api.js'
import { HttpError } from '../utils/httpError.js'

const favoritesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/favorites',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const body = request.body
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Expected JSON object body')
      }
      const rec = body as Record<string, unknown>
      const playerUserNum = rec.playerUserNum
      const nicknameSnapshot = rec.nicknameSnapshot

      if (
        typeof playerUserNum !== 'number' ||
        !Number.isFinite(playerUserNum) ||
        !Number.isInteger(playerUserNum)
      ) {
        throw new HttpError(400, 'INVALID_REQUEST', 'playerUserNum must be an integer')
      }
      if (typeof nicknameSnapshot !== 'string' || !nicknameSnapshot.trim()) {
        throw new HttpError(400, 'INVALID_REQUEST', 'nicknameSnapshot must be a non-empty string')
      }

      const userDbId = await resolveStubUserId(app.prisma, request.userId)

      try {
        const row = await app.prisma.favoritePlayer.create({
          data: {
            userId: userDbId,
            playerUserNum: BigInt(playerUserNum),
            nicknameSnapshot: nicknameSnapshot.trim(),
          },
        })
        return reply.status(201).send(
          apiResult({
            playerUserNum: Number(row.playerUserNum),
            nickname: row.nicknameSnapshot,
            addedAt: row.createdAt.toISOString(),
          }),
        )
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new HttpError(409, 'DUPLICATE_FAVORITE', 'Favorite already exists')
        }
        throw e
      }
    },
  )

  app.get('/favorites', { preHandler: authMiddleware }, async (request, reply) => {
    const userDbId = await resolveStubUserId(app.prisma, request.userId)
    const rows = await app.prisma.favoritePlayer.findMany({
      where: { userId: userDbId },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(
      apiResult(
        rows.map((r) => ({
          playerUserNum: Number(r.playerUserNum),
          nickname: r.nicknameSnapshot,
          addedAt: r.createdAt.toISOString(),
        })),
      ),
    )
  })
}

export default favoritesRoutes
