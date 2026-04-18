import { apiClient } from '@/api/client'
import { MOCK_MATCHES } from '@/mocks/matches'
import { MOCK_PLAYER_ROWS } from '@/mocks/players'
import type { ApiResult } from '@/types/api'
import type { MatchSummary } from '@/types/match'
import type { PlayerStats, PlayerSummary } from '@/types/player'

const PAGE_SIZE = 10

function hasApiKey(): boolean {
  return Boolean(import.meta.env.VITE_BSER_API_KEY?.trim())
}

function cacheResult<T>(data: T): ApiResult<T> {
  return {
    data,
    source: 'cache',
    refreshedAt: new Date().toISOString(),
  }
}

function matchesForUser(userNum: number): MatchSummary[] {
  return MOCK_MATCHES.filter((m) => m.userNum === userNum).sort(
    (a, b) => new Date(b.gameStartedAt).getTime() - new Date(a.gameStartedAt).getTime(),
  )
}

export async function searchPlayers(nickname: string): Promise<ApiResult<PlayerSummary[]>> {
  if (!hasApiKey()) {
    const q = nickname.trim().toLowerCase()
    const rows = MOCK_PLAYER_ROWS.filter((row) => row.summary.nickname.toLowerCase().includes(q))
    return cacheResult(rows.map((r) => r.summary))
  }

  // TODO: Wire BSER player search — endpoint and response mapping TBD
  const { data } = await apiClient.get<ApiResult<PlayerSummary[]>>('/players/search', {
    params: { nickname },
  })
  return data
}

export async function fetchPlayerStats(userNum: number): Promise<ApiResult<PlayerStats>> {
  if (!hasApiKey()) {
    const row = MOCK_PLAYER_ROWS.find((r) => r.summary.userNum === userNum)
    if (!row) {
      throw new Error('Player stats not found (mock)')
    }
    return cacheResult(row.stats)
  }

  // TODO: Wire BSER user stats — endpoint TBD
  const { data } = await apiClient.get<ApiResult<PlayerStats>>(`/players/${userNum}/stats`)
  return data
}

export async function fetchMatchHistory(
  userNum: number,
  page: number,
): Promise<ApiResult<MatchSummary[]>> {
  if (!hasApiKey()) {
    const all = matchesForUser(userNum)
    const start = page * PAGE_SIZE
    const slice = all.slice(start, start + PAGE_SIZE)
    return cacheResult(slice)
  }

  // TODO: Wire BSER match history with pagination — endpoint TBD
  const { data } = await apiClient.get<ApiResult<MatchSummary[]>>(`/players/${userNum}/matches`, {
    params: { page, pageSize: PAGE_SIZE },
  })
  return data
}
