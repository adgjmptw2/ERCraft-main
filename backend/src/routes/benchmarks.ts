import type { FastifyPluginAsync } from 'fastify'

import {
  getCharacterGradeBenchmarkStatus,
  getLocalCollectedGamesStatus,
} from '../services/characterPerformanceGrade/benchmarkStatus.js'
import { apiResult } from '../types/api.js'

const benchmarksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/benchmark/status', async () => {
    const base = getCharacterGradeBenchmarkStatus()
    const localCollectedGames = await getLocalCollectedGamesStatus(app.prisma)
    return apiResult(
      localCollectedGames ? { ...base, localCollectedGames } : base,
      'cache',
    )
  })
}

export default benchmarksRoutes
