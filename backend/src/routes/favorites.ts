import { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { authMiddleware } from '../middleware/auth.js'
import { createFavoriteBody } from '../schemas.js'
import { apiResult } from '../types/api.js'
import { HttpError } from '../utils/httpError.js'

const favoritesRoutes: FastifyPluginAsync = async (app) => {
  const withZod = app.withTypeProvider<ZodTypeProvider>()

  withZod.post(
    '/favorites',
    {
      preHandler: authMiddleware,
      schema: { body: createFavoriteBody },
    },
    async (request, reply) => {
      const { playerUserNum, nicknameSnapshot } = request.body

      try {
        const row = await app.prisma.favoritePlayer.create({
          data: {
            userId: request.userId,
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

  withZod.get('/favorites', { preHandler: authMiddleware }, async (request, reply) => {
    const rows = await app.prisma.favoritePlayer.findMany({
      where: { userId: request.userId },
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
