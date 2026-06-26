import type { EternalReturnClient } from '@/api/erClient'
import {
  buildMockStatsForUser,
  getDemoPlayerSeasonHistory,
  getMockPlayerSummaryByNickname,
  searchMockPlayersByNickname,
  sortedMatchesForUser,
} from '@/mocks/loader'
import { DEMO_LATEST_SEASON } from '@/mocks/seasonHistory'
import { demoSeasonToPlayerSeason } from '@/types/season'
import type { MatchSummary, Paginated } from '@/types/match'
import type { MatchHistoryMode } from '@/types/matchMode'
import type { ProfileEntryFreshnessResult } from '@/types/api'
import type { PlayerFetchOptions, PlayerSeasonAggregateDTO, PlayerStats, PlayerSummary } from '@/types/player'
import type { PlayerSeasonsResponse } from '@/types/season'
import { resolveGameMode } from '@/utils/gameMode'
import { throwApiError } from '@/utils/apiError'

export class MockEternalReturnClient implements EternalReturnClient {
  async searchPlayers(nickname: string): Promise<PlayerSummary[]> {
    return searchMockPlayersByNickname(nickname)
  }

  async fetchPlayerByNickname(nickname: string, options?: PlayerFetchOptions): Promise<PlayerSummary | null> {
    void options
    return getMockPlayerSummaryByNickname(nickname) ?? null
  }

  async fetchPlayerStats(nickname: string, options?: PlayerFetchOptions): Promise<PlayerStats> {
    void options
    const player = getMockPlayerSummaryByNickname(nickname)
    const stats = player ? buildMockStatsForUser(player.userNum) : null
    if (!stats) {
      throwApiError('PLAYER_NOT_FOUND', 'Player stats not found')
    }
    return stats
  }

  async fetchMatchHistory(
    nickname: string,
    page: number,
    pageSize: number,
    options?: PlayerFetchOptions,
  ): Promise<Paginated<MatchSummary>> {
    const player = getMockPlayerSummaryByNickname(nickname)
    if (!player) {
      return { items: [], page, pageSize, hasNext: false }
    }
    const mode: MatchHistoryMode = options?.matchMode ?? 'all'
    const all = sortedMatchesForUser(player.userNum)
    const filtered =
      mode === 'all' ? all : all.filter((match) => resolveGameMode(match) === mode)
    const start = page * pageSize
    const items = filtered.slice(start, start + pageSize)
    const hasNext = start + items.length < filtered.length
    return { items, page, pageSize, hasNext }
  }

  async fetchPlayerSeasons(
    nickname: string,
    from: number,
    to: number,
    options?: PlayerFetchOptions,
  ): Promise<PlayerSeasonsResponse> {
    void options
    const player = getMockPlayerSummaryByNickname(nickname)
    if (!player) {
      return { currentSeason: DEMO_LATEST_SEASON, seasons: [] }
    }

    const seasons = getDemoPlayerSeasonHistory(player.userNum)
      .filter((record) => record.seasonNumber >= from && record.seasonNumber <= to)
      .map(demoSeasonToPlayerSeason)

    return { currentSeason: DEMO_LATEST_SEASON, seasons }
  }

  async fetchPlayerSeasonAggregate(
    nickname: string,
    seasonId: number,
    options?: PlayerFetchOptions,
  ): Promise<PlayerSeasonAggregateDTO> {
    void options
    const player = getMockPlayerSummaryByNickname(nickname)
    return {
      userNum: player?.userNum ?? 0,
      seasonId,
      apiSeasonId: seasonId,
      cacheStatus: 'partial',
      source: 'cache',
      basisLabel: '시즌 집계 중',
      isRefreshing: true,
      characterStats: [],
      rpSeries: [],
      lastRefreshedAt: new Date().toISOString(),
    }
  }

  async fetchProfileEntryFreshness(
    nickname: string,
    options?: PlayerFetchOptions,
  ): Promise<ProfileEntryFreshnessResult> {
    void nickname
    void options
    return {
      status: 'already-fresh',
      rankUpdated: false,
      latestGameIdBefore: null,
      latestGameIdAfter: null,
      upstreamLatestGameId: null,
      gamesFetched: 0,
      newGamesInserted: 0,
      matchesUpdated: false,
      statsInvalidated: false,
      aggregateInvalidated: false,
      snapshotInvalidatedOrRebuilt: false,
      refreshCompletedAt: new Date().toISOString(),
      skipReason: 'no-new-games',
    }
  }

  async fetchPlayerAnalysis(): Promise<import('@/types/playerAnalysis').PlayerAnalysisResponseDTO> {
    return {
      owner: { canonicalUid: 'mock', nickname: 'mock', seasonId: 11 },
      scope: 'all',
      sourceFingerprint: 'mock',
      computedAt: new Date().toISOString(),
      totals: {
        eligibleMatches: 0,
        rankMatches: 0,
        normalMatches: 0,
        excludedCobalt: 0,
        excludedUnion: 0,
        excludedDuplicate: 0,
        excludedOwnership: 0,
      },
      rows: [],
    }
  }
}
