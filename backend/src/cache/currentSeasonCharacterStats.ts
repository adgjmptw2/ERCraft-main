import type { PrismaClient } from '@prisma/client'

import type { SeasonCharacterAggregateContract } from '../contracts/player.js'
import { uidToUserNum } from '../external/bserMapper.js'
import type { PlayerMatchRow } from '../utils/playerMatchDedup.js'
import { buildCharacterAggregatesFromMatches } from './seasonAggregateBuilder.js'
import {
  isPrismaPlayerMatchReady,
  readPlayerMatchesForVerifiedSources,
  toMatchSummaryFromPlayerMatch,
} from './playerMatchStore.js'

export interface CurrentSeasonCharacterStatsResult {
  characterStats: SeasonCharacterAggregateContract[]
  rawMatchCount: number
  deduplicatedMatchCount: number
  sourceCount: number
  rows: PlayerMatchRow[]
}

export async function buildCurrentSeasonCharacterStatsFromPlayerMatches(
  prisma: PrismaClient,
  params: {
    uid: string
    playerMatchUids?: string[]
    apiSeasonId: number
    displaySeasonId: number
  },
): Promise<SeasonCharacterAggregateContract[]> {
  const result = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, params)
  return result.characterStats
}

export async function buildCurrentSeasonCharacterStatsFromVerifiedSources(
  prisma: PrismaClient,
  params: {
    uid: string
    playerMatchUids?: string[]
    apiSeasonId: number
    displaySeasonId: number
  },
): Promise<CurrentSeasonCharacterStatsResult> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return {
      characterStats: [],
      rawMatchCount: 0,
      deduplicatedMatchCount: 0,
      sourceCount: 0,
      rows: [],
    }
  }

  const uids = params.playerMatchUids?.length
    ? [...new Set(params.playerMatchUids)]
    : [params.uid]

  const { rows, rawMatchCount, deduplicatedMatchCount } = await readPlayerMatchesForVerifiedSources(
    prisma,
    {
      uids,
      canonicalUid: params.uid,
      apiSeasonId: params.apiSeasonId,
      gameMode: 'rank',
    },
  )

  if (rows.length === 0) {
    return {
      characterStats: [],
      rawMatchCount,
      deduplicatedMatchCount,
      sourceCount: uids.length,
      rows: [],
    }
  }

  const userNum = uidToUserNum(params.uid)
  const matches = rows.map((row) => toMatchSummaryFromPlayerMatch(row, userNum))
  const characterStats = buildCharacterAggregatesFromMatches(
    matches,
    params.displaySeasonId,
    params.apiSeasonId,
  )

  return {
    characterStats,
    rawMatchCount,
    deduplicatedMatchCount,
    sourceCount: uids.length,
    rows,
  }
}
