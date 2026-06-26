import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { resolveMatchDetail } from '../cache/matchDetailService.js'
import { isPrismaMatchDetailReady } from '../cache/matchDetailStore.js'
import { config } from '../config/env.js'
import { BserApiError, BserClient } from '../external/bserClient.js'
import { loadSeasonCatalog } from '../external/seasonCatalog.js'
import { gameIdParams } from '../schemas.js'
import { apiResult } from '../types/api.js'
import { HttpError } from '../utils/httpError.js'

function toMatchDetailHttpError(e: unknown): unknown {
  if (e instanceof HttpError) return e
  if (e instanceof BserApiError) {
    if (e.status === 404) {
      return new HttpError(404, 'NOT_FOUND', 'Match detail not found')
    }
    if (e.status === 504) {
      return new HttpError(
        504,
        'UPSTREAM_TIMEOUT',
        '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
      )
    }
    if (e.status === 429 || e.status === 403) {
      return new HttpError(429, 'RATE_LIMITED', 'BSER rate limit exceeded, retry later')
    }
    return new HttpError(502, 'UPSTREAM_ERROR', `BSER upstream error: ${e.message}`)
  }
  return e
}

const matchesRoutes: FastifyPluginAsync = async (app) => {
  const bser = new BserClient(config.bserApiKey)
  let characterNames: Map<number, string> | null = null

  function requireApiKey(): void {
    if (!config.bserApiKey) {
      throw new HttpError(503, 'UPSTREAM_ERROR', 'BSER API key is not configured')
    }
  }

  async function resolveCharacterNames(): Promise<Map<number, string>> {
    if (characterNames) return characterNames
    characterNames = await bser.getCharacterNames()
    return characterNames
  }

  const withZod = app.withTypeProvider<ZodTypeProvider>()

  withZod.get(
    '/matches/:gameId/detail',
    { schema: { params: gameIdParams } },
    async (request, reply) => {
      requireApiKey()
      const gameId = request.params.gameId
      const started = Date.now()
      try {
        const { detail, source, fetchMeta } = await resolveMatchDetail({
          prisma: app.prisma,
          bser,
          gameId,
          resolveCharacterNames,
          resolveCatalog: () => loadSeasonCatalog(bser).catch(() => null),
          storeRawJson: true,
        })

        request.log.info(
          {
            gameId,
            detailStatus: detail.detailStatus,
            source,
            teamCount: detail.teams.length,
            participantCount: detail.teams.reduce((sum, team) => sum + team.participants.length, 0),
            matchDetailDbReady: isPrismaMatchDetailReady(app.prisma),
            durationMs: Date.now() - started,
            cacheHit: fetchMeta.cacheHit,
            inflightShared: fetchMeta.inflightShared,
            queuedMs: fetchMeta.queuedMs,
            upstreamMs: fetchMeta.upstreamMs,
            waitMs: fetchMeta.waitMs,
          },
          'match detail',
        )

        return reply.send(apiResult(detail, source, fetchMeta))
      } catch (e) {
        throw toMatchDetailHttpError(e)
      }
    },
  )
}

export default matchesRoutes
