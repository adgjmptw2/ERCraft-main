import { apiClient } from '@/api/client'
import {
  buildMockStatsDTOForUser,
  buildMockStatsForUser,
  getMockPlayerByUserNum,
  getMockPlayerSummaryByNickname,
  searchMockPlayersByNickname,
  sliceMockMatchDTOHistory,
  sliceMockMatchHistory,
} from '@/mocks/loader'
import type { ApiResult } from '@/types/api'
import type { MatchSummary, MatchSummaryDTO, Paginated } from '@/types/match'
import type { PlayerStats, PlayerStatsDTO, PlayerSummary } from '@/types/player'
import { throwApiError } from '@/utils/apiError'

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

export async function searchPlayers(nickname: string): Promise<ApiResult<PlayerSummary[]>> {
  if (!hasApiKey()) {
    return cacheResult(searchMockPlayersByNickname(nickname))
  }

  // TODO: BSER — 플레이어 검색
  const { data } = await apiClient.get<ApiResult<PlayerSummary[]>>('/players/search', {
    params: { nickname },
  })
  return data
}

export async function fetchPlayerByNickname(
  nickname: string,
): Promise<ApiResult<PlayerSummary | null>> {
  if (!hasApiKey()) {
    const found = getMockPlayerSummaryByNickname(nickname)
    return cacheResult(found ?? null)
  }

  // TODO: BSER — 프로필 by nickname
  const { data } = await apiClient.get<ApiResult<PlayerSummary | null>>(
    `/players/${encodeURIComponent(nickname)}`,
  )
  return data
}

export async function fetchPlayerStats(userNum: number): Promise<ApiResult<PlayerStats>> {
  if (!hasApiKey()) {
    const stats = buildMockStatsForUser(userNum)
    if (!stats) {
      throwApiError('PLAYER_NOT_FOUND', 'Player stats not found')
    }
    return cacheResult(stats)
  }

  // TODO: BSER — 시즌 스탯
  const { data } = await apiClient.get<ApiResult<PlayerStats>>(`/players/${userNum}/stats`)
  return data
}

export async function fetchMatchHistory(
  userNum: number,
  page: number,
): Promise<ApiResult<Paginated<MatchSummary>>> {
  if (!hasApiKey()) {
    return cacheResult(sliceMockMatchHistory(userNum, page, PAGE_SIZE))
  }

  // TODO: BSER — 매치 히스토리(페이지)
  const { data } = await apiClient.get<ApiResult<Paginated<MatchSummary>>>(
    `/players/${userNum}/matches`,
    {
      params: { page, pageSize: PAGE_SIZE },
    },
  )
  return data
}

export async function fetchPlayerStatsDTO(
  userNum: number,
): Promise<ApiResult<PlayerStatsDTO>> {
  if (!hasApiKey()) {
    const dto = buildMockStatsDTOForUser(userNum)
    if (!dto) {
      throwApiError('PLAYER_NOT_FOUND', 'Player stats not found')
    }
    return cacheResult(dto)
  }

  // TODO: BSER — 시즌 스탯 DTO
  throwApiError('NOT_IMPLEMENTED', 'DTO path not wired to real API yet')
}

export async function fetchMatchDTOHistory(
  userNum: number,
  page: number,
): Promise<ApiResult<Paginated<MatchSummaryDTO>>> {
  if (!hasApiKey()) {
    if (!getMockPlayerByUserNum(userNum)) {
      throwApiError('PLAYER_NOT_FOUND', 'Player not found')
    }
    return cacheResult(sliceMockMatchDTOHistory(userNum, page, PAGE_SIZE))
  }

  // TODO: BSER — 매치 히스토리 DTO
  throwApiError('NOT_IMPLEMENTED', 'DTO path not wired to real API yet')
}
