import cors from '@fastify/cors'
import { PrismaClient } from '@prisma/client'
import Fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

import { config } from './config/env.js'
import { SERVER_STARTED_AT, resolveServerBuildTimestamp } from './serverMeta.js'
import { attachErrorHandlers } from './plugins/errorHandler.js'
import { warnPrismaCacheReadiness } from './cache/prismaCacheReady.js'
import favoritesRoutes from './routes/favorites.js'
import benchmarksRoutes from './routes/benchmarks.js'
import matchesRoutes from './routes/matches.js'
import playersRoutes from './routes/players.js'
import searchHistoryRoutes from './routes/searchHistory.js'

export interface CreateAppOptions {
  prisma?: PrismaClient
}

export async function createApp(options: CreateAppOptions = {}) {
  const prisma = options.prisma ?? new PrismaClient()
  const app = Fastify({ logger: process.env.NODE_ENV !== 'production' })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('prisma', prisma)

  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })

  const origins = config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
  await app.register(cors, { origin: origins.length > 0 ? origins : true })

  attachErrorHandlers(app)

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    startedAt: SERVER_STARTED_AT,
    buildTimestamp: resolveServerBuildTimestamp(),
  }))

  await app.register(favoritesRoutes, { prefix: '/api' })
  await app.register(benchmarksRoutes, { prefix: '/api' })
  await app.register(searchHistoryRoutes, { prefix: '/api' })
  await app.register(playersRoutes, { prefix: '/api' })
  await app.register(matchesRoutes, { prefix: '/api' })

  if (process.env.NODE_ENV !== 'production') {
    warnPrismaCacheReadiness(prisma)
  }

  return app
}
