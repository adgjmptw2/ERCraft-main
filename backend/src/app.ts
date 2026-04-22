import { PrismaClient } from '@prisma/client'
import Fastify from 'fastify'

import { attachErrorHandlers } from './plugins/errorHandler.js'
import favoritesRoutes from './routes/favorites.js'
import searchHistoryRoutes from './routes/searchHistory.js'

export interface CreateAppOptions {
  prisma?: PrismaClient
}

export async function createApp(options: CreateAppOptions = {}) {
  const prisma = options.prisma ?? new PrismaClient()
  const app = Fastify({ logger: false })

  app.decorate('prisma', prisma)

  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })

  attachErrorHandlers(app)

  await app.register(favoritesRoutes, { prefix: '/api' })
  await app.register(searchHistoryRoutes, { prefix: '/api' })

  return app
}
