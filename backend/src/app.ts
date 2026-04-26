import { PrismaClient } from '@prisma/client'
import Fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

import { attachErrorHandlers } from './plugins/errorHandler.js'
import favoritesRoutes from './routes/favorites.js'
import searchHistoryRoutes from './routes/searchHistory.js'

export interface CreateAppOptions {
  prisma?: PrismaClient
}

export async function createApp(options: CreateAppOptions = {}) {
  const prisma = options.prisma ?? new PrismaClient()
  const app = Fastify({ logger: false })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('prisma', prisma)

  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })

  attachErrorHandlers(app)

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })

  await app.register(favoritesRoutes, { prefix: '/api' })
  await app.register(searchHistoryRoutes, { prefix: '/api' })

  return app
}
