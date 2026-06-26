import type { PrismaClient } from '@prisma/client'

import type { MatchDetailContract } from '../contracts/matchDetail.js'
import type { BserClient } from '../external/bserClient.js'
import { peekBserLimiterTiming } from '../external/bserClient.js'
import { mapBserGamesToMatchDetail } from '../external/matchDetailMapper.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import type { MatchDetailFetchMeta } from '../types/api.js'
import {
  isPrismaMatchDetailReady,
  readMatchDetailFromDb,
  writeMatchDetailToDb,
} from './matchDetailStore.js'

const inflight = new Map<string, Promise<MatchDetailContract>>()

export function clearMatchDetailInflightForTests(): void {
  inflight.clear()
}

export function isMatchDetailInflight(gameId: string): boolean {
  return inflight.has(gameId)
}

function emptyFetchMeta(overrides: Partial<MatchDetailFetchMeta> = {}): MatchDetailFetchMeta {
  return {
    cacheHit: false,
    inflightShared: false,
    queuedMs: 0,
    upstreamMs: 0,
    waitMs: 0,
    ...overrides,
  }
}

function readLimiterTiming(): Pick<MatchDetailFetchMeta, 'queuedMs' | 'upstreamMs'> {
  const timing = peekBserLimiterTiming()
  if (!timing) return { queuedMs: 0, upstreamMs: 0 }
  return {
    queuedMs: Math.max(0, timing.startedAt - timing.queuedAt),
    upstreamMs: Math.max(0, timing.completedAt - timing.startedAt),
  }
}

export async function resolveMatchDetail(params: {
  prisma: PrismaClient
  bser: BserClient
  gameId: string
  resolveCharacterNames: () => Promise<ReadonlyMap<number, string>>
  resolveCatalog?: () => Promise<SeasonCatalog | null | undefined>
  storeRawJson?: boolean
}): Promise<{ detail: MatchDetailContract; source: 'cache' | 'external'; fetchMeta: MatchDetailFetchMeta }> {
  const gameId = params.gameId.trim()
  const requestStartedAt = Date.now()

  if (!/^\d+$/.test(gameId)) {
    return {
      detail: {
        gameId,
        gameMode: 'normal',
        playedAt: new Date(0).toISOString(),
        detailStatus: 'unavailable',
        teams: [],
      },
      source: 'cache',
      fetchMeta: emptyFetchMeta({ cacheHit: true, waitMs: Date.now() - requestStartedAt }),
    }
  }

  if (isPrismaMatchDetailReady(params.prisma)) {
    const cached = await readMatchDetailFromDb(params.prisma, gameId)
    if (cached) {
      return {
        detail: cached,
        source: 'cache',
        fetchMeta: emptyFetchMeta({
          cacheHit: true,
          waitMs: Date.now() - requestStartedAt,
        }),
      }
    }
  }

  const existing = inflight.get(gameId)
  if (existing) {
    const detail = await existing
    return {
      detail,
      source: 'external',
      fetchMeta: emptyFetchMeta({
        inflightShared: true,
        waitMs: Date.now() - requestStartedAt,
      }),
    }
  }

  const load = (async (): Promise<MatchDetailContract> => {
    const [characterNames, catalog] = await Promise.all([
      params.resolveCharacterNames(),
      params.resolveCatalog?.() ?? Promise.resolve(null),
    ])

    const games = await params.bser.getGame(gameId)
    const detail = mapBserGamesToMatchDetail({
      gameId,
      games,
      characterNames,
      catalog: catalog ?? undefined,
    })

    if (
      detail.detailStatus === 'ready' &&
      isPrismaMatchDetailReady(params.prisma)
    ) {
      await writeMatchDetailToDb(
        params.prisma,
        detail,
        params.storeRawJson ? games : null,
      )
      const persisted = await readMatchDetailFromDb(params.prisma, gameId)
      return persisted ?? detail
    }

    return detail
  })()

  inflight.set(gameId, load)
  try {
    const detail = await load
    const limiterTiming = readLimiterTiming()
    return {
      detail,
      source: detail.detailStatus === 'ready' ? 'external' : 'cache',
      fetchMeta: emptyFetchMeta({
        ...limiterTiming,
        waitMs: Date.now() - requestStartedAt,
      }),
    }
  } finally {
    if (inflight.get(gameId) === load) {
      inflight.delete(gameId)
    }
  }
}
