import type { MatchSummary, Paginated } from '@/types/match'
import type { ProfileEntryFreshnessResult } from '@/types/api'
import type { PlayerFetchOptions, PlayerSeasonAggregateDTO, PlayerStats, PlayerSummary } from '@/types/player'
import type { PlayerAnalysisResponseDTO } from '@/types/playerAnalysis'
import type { PlayerSeasonsResponse } from '@/types/season'

import { MockEternalReturnClient } from '@/api/erClient.mock'
import { RealEternalReturnClient } from '@/api/erClient.real'

// BSER OpenAPI v11부터 userNum 조회가 폐지되어(닉네임 → uid는 백엔드에서만 해석)
// 클라이언트 인터페이스는 닉네임 키로 통일한다.
export interface EternalReturnClient {
  searchPlayers(nickname: string): Promise<PlayerSummary[]>
  fetchPlayerByNickname(nickname: string, options?: PlayerFetchOptions): Promise<PlayerSummary | null>
  fetchPlayerStats(nickname: string, options?: PlayerFetchOptions): Promise<PlayerStats>
  fetchMatchHistory(
    nickname: string,
    page: number,
    pageSize: number,
    options?: PlayerFetchOptions,
  ): Promise<Paginated<MatchSummary>>
  fetchPlayerSeasons(
    nickname: string,
    from: number,
    to: number,
    options?: PlayerFetchOptions,
  ): Promise<PlayerSeasonsResponse>
  fetchPlayerSeasonAggregate(
    nickname: string,
    seasonId: number,
    options?: PlayerFetchOptions,
  ): Promise<PlayerSeasonAggregateDTO>
  fetchProfileEntryFreshness(
    nickname: string,
    options?: PlayerFetchOptions,
  ): Promise<ProfileEntryFreshnessResult>
  fetchPlayerAnalysis(
    nickname: string,
    options?: PlayerFetchOptions,
  ): Promise<PlayerAnalysisResponseDTO>
}

/**
 * Real API: VITE_API_BASE_URL이 있거나, dev에서 VITE_USE_REAL_API=true(프록시 경유).
 * 둘 다 없으면 mock.
 */
function hasBackendUrl(): boolean {
  if (import.meta.env.VITE_API_BASE_URL?.trim()) return true
  return import.meta.env.DEV && import.meta.env.VITE_USE_REAL_API === 'true'
}

export function isRealMode(): boolean {
  return hasBackendUrl()
}

export function getClient(): EternalReturnClient {
  return hasBackendUrl() ? new RealEternalReturnClient() : new MockEternalReturnClient()
}
