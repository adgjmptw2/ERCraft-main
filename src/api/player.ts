import { getClient, isRealMode } from '@/api/erClient'
import type { ApiResult, ProfileEntryFreshnessResult } from '@/types/api'
import type { MatchSummary, MatchSummaryDTO, Paginated } from '@/types/match'
import type {
  NormalizedRankTier,
  PlayerFetchOptions,
  PlayerSeasonAggregateDTO,
  PlayerStats,
  PlayerStatsDTO,
  PlayerSummary,
} from '@/types/player'
import type { PlayerSeasonsResponse } from '@/types/season'
import { throwApiError } from '@/utils/apiError'
import { toMatchSummaryDTO, toStatsDTO } from '@/utils/dto'

const PAGE_SIZE = 10
// 통계 DTO 집계용 최근 경기 수 — 프로필 최초 진입 pageSize와 동일
const DTO_MATCH_FETCH_SIZE = 10

function wrap<T>(data: T): ApiResult<T> {
  return {
    data,
    source: isRealMode() ? 'external' : 'cache',
    refreshedAt: new Date().toISOString(),
  }
}

export async function searchPlayers(nickname: string): Promise<ApiResult<PlayerSummary[]>> {
  const term = nickname.trim()
  if (term.length < 2) {
    throwApiError('INVALID_REQUEST', '닉네임은 2자 이상 입력해 주세요.')
  }
  const data = await getClient().searchPlayers(term)
  return wrap(data)
}

export async function fetchPlayerByNickname(
  nickname: string,
  options?: PlayerFetchOptions,
): Promise<ApiResult<PlayerSummary | null>> {
  const term = nickname.trim()
  if (!term) {
    return wrap(null)
  }
  const data = await getClient().fetchPlayerByNickname(term, options)
  return wrap(data)
}

export async function fetchPlayerStats(
  nickname: string,
  options?: PlayerFetchOptions,
): Promise<ApiResult<PlayerStats>> {
  const data = await getClient().fetchPlayerStats(nickname, options)
  return wrap(data)
}

export async function fetchMatchHistory(
  nickname: string,
  page: number,
  options?: PlayerFetchOptions,
  pageSize = PAGE_SIZE,
): Promise<ApiResult<Paginated<MatchSummary>>> {
  const data = await getClient().fetchMatchHistory(nickname, page, pageSize, options)
  return wrap(data)
}

export async function fetchPlayerStatsDTO(
  nickname: string,
  options?: {
    tier?: string
    userNum?: number
    normalizedTier?: NormalizedRankTier
    leaderboardRank?: number | null
    signal?: AbortSignal
    refresh?: boolean
  },
): Promise<ApiResult<PlayerStatsDTO>> {
  const client = getClient()
  const fetchOptions: PlayerFetchOptions | undefined = (() => {
    const base: PlayerFetchOptions = {}
    if (options?.userNum != null && options.userNum > 0) base.userNum = options.userNum
    if (options?.signal) base.signal = options.signal
    if (options?.refresh === true) base.refresh = true
    return Object.keys(base).length > 0 ? base : undefined
  })()
  const stats = await client.fetchPlayerStats(nickname, fetchOptions)

  let tier = options?.tier
  if (!tier) {
    if (isRealMode()) {
      tier = ''
    } else {
      const summary = await client.fetchPlayerByNickname(nickname)
      if (!summary) {
        throwApiError('PLAYER_NOT_FOUND', 'Player stats not found')
      }
      tier = summary.tier
    }
  }

  let matchItems: Awaited<ReturnType<typeof client.fetchMatchHistory>>['items'] = []
  if (!isRealMode()) {
    try {
      const history = await client.fetchMatchHistory(nickname, 0, DTO_MATCH_FETCH_SIZE)
      matchItems = history.items
    } catch {
      // mock — 매치 목록 실패해도 통계 DTO는 stats 기준으로 표시
    }
  }
  return wrap(toStatsDTO(stats, matchItems, tier, {
    normalizedTier: options?.normalizedTier,
    leaderboardRank: options?.leaderboardRank,
  }))
}

export async function fetchMatchDTOHistory(
  nickname: string,
  page: number,
  pageSize = PAGE_SIZE,
  options?: PlayerFetchOptions,
): Promise<ApiResult<Paginated<MatchSummaryDTO>>> {
  const history = await getClient().fetchMatchHistory(nickname, page, pageSize, options)
  return wrap({
    ...history,
    items: history.items.map((m) => toMatchSummaryDTO(m, undefined, {
      useDemoFallbacks: !isRealMode(),
    })),
  })
}

/** 프로필 캐릭터 통계 — 시즌 전체 랭크 집계용, 페이지 끝까지 수집 (BSER 최근 90일 상한) */
const ALL_MATCHES_MAX_PAGES = 40

export async function fetchAllMatchDTOHistory(
  nickname: string,
  options?: PlayerFetchOptions,
): Promise<MatchSummaryDTO[]> {
  const items: MatchSummaryDTO[] = []
  let page = 0
  let hasNext = true

  while (hasNext && page < ALL_MATCHES_MAX_PAGES) {
    const result = await fetchMatchDTOHistory(nickname, page, DTO_MATCH_FETCH_SIZE, options)
    items.push(...result.data.items)
    hasNext = result.data.hasNext
    page += 1
  }

  return items
}

export async function fetchPlayerSeasons(
  nickname: string,
  from = 1,
  to = 11,
  options?: PlayerFetchOptions,
): Promise<ApiResult<PlayerSeasonsResponse>> {
  const data = await getClient().fetchPlayerSeasons(nickname, from, to, options)
  return wrap(data)
}

export async function getPlayerSeasonAggregate(
  nickname: string,
  seasonId: number,
  options?: PlayerFetchOptions,
): Promise<ApiResult<PlayerSeasonAggregateDTO>> {
  const data = await getClient().fetchPlayerSeasonAggregate(nickname, seasonId, options)
  return wrap(data)
}

export async function fetchProfileEntryFreshness(
  nickname: string,
  options?: PlayerFetchOptions,
): Promise<ApiResult<ProfileEntryFreshnessResult>> {
  const term = nickname.trim()
  if (!term) {
    throwApiError('INVALID_REQUEST', '닉네임이 필요합니다.')
  }
  const data = await getClient().fetchProfileEntryFreshness(term, options)
  return wrap(data)
}
