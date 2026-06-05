import { getClient, isRealMode } from '@/api/erClient'
import type { ApiResult } from '@/types/api'
import type { MatchSummary, MatchSummaryDTO, Paginated } from '@/types/match'
import type { PlayerStats, PlayerStatsDTO, PlayerSummary } from '@/types/player'
import { throwApiError } from '@/utils/apiError'
import { toMatchSummaryDTO, toStatsDTO } from '@/utils/dto'

const PAGE_SIZE = 10
// 실 API 전까지 mock 집계용 — 서버 stats-dto로 옮길 예정
const DTO_MATCH_FETCH_SIZE = 200

function wrap<T>(data: T): ApiResult<T> {
  return {
    data,
    source: isRealMode() ? 'external' : 'cache',
    refreshedAt: new Date().toISOString(),
  }
}

export async function searchPlayers(nickname: string): Promise<ApiResult<PlayerSummary[]>> {
  const data = await getClient().searchPlayers(nickname)
  return wrap(data)
}

export async function fetchPlayerByNickname(
  nickname: string,
): Promise<ApiResult<PlayerSummary | null>> {
  const data = await getClient().fetchPlayerByNickname(nickname)
  return wrap(data)
}

export async function fetchPlayerStats(userNum: number): Promise<ApiResult<PlayerStats>> {
  const data = await getClient().fetchPlayerStats(userNum)
  return wrap(data)
}

export async function fetchMatchHistory(
  userNum: number,
  page: number,
): Promise<ApiResult<Paginated<MatchSummary>>> {
  const data = await getClient().fetchMatchHistory(userNum, page, PAGE_SIZE)
  return wrap(data)
}

export async function fetchPlayerStatsDTO(
  userNum: number,
  options?: { tier?: string },
): Promise<ApiResult<PlayerStatsDTO>> {
  const client = getClient()
  const stats = await client.fetchPlayerStats(userNum)

  let tier = options?.tier
  if (!tier) {
    // tier 미전달 시에만 userNum 조회
    const summary = await client.fetchPlayerByUserNum(userNum)
    if (!summary) {
      throwApiError('PLAYER_NOT_FOUND', 'Player stats not found')
    }
    tier = summary.tier
  }

  const history = await client.fetchMatchHistory(userNum, 0, DTO_MATCH_FETCH_SIZE)
  return wrap(toStatsDTO(stats, history.items, tier))
}

export async function fetchMatchDTOHistory(
  userNum: number,
  page: number,
): Promise<ApiResult<Paginated<MatchSummaryDTO>>> {
  const history = await getClient().fetchMatchHistory(userNum, page, PAGE_SIZE)
  return wrap({
    ...history,
    items: history.items.map((m) => toMatchSummaryDTO(m)),
  })
}
