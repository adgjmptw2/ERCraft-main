import type { MatchSummary, Paginated } from '@/types/match'
import type { PlayerStats, PlayerSummary } from '@/types/player'

import { MockEternalReturnClient } from '@/api/erClient.mock'
import { RealEternalReturnClient } from '@/api/erClient.real'

export interface EternalReturnClient {
  searchPlayers(nickname: string): Promise<PlayerSummary[]>
  fetchPlayerByNickname(nickname: string): Promise<PlayerSummary | null>
  /** DTO tier용 */
  fetchPlayerByUserNum(userNum: number): Promise<PlayerSummary | null>
  fetchPlayerStats(userNum: number): Promise<PlayerStats>
  fetchMatchHistory(
    userNum: number,
    page: number,
    pageSize: number,
  ): Promise<Paginated<MatchSummary>>
}

/** VITE_API_BASE_URL 있으면 Real, 없으면 mock */
function hasBackendUrl(): boolean {
  return Boolean(import.meta.env.VITE_API_BASE_URL?.trim())
}

export function isRealMode(): boolean {
  return hasBackendUrl()
}

export function getClient(): EternalReturnClient {
  return hasBackendUrl() ? new RealEternalReturnClient() : new MockEternalReturnClient()
}
