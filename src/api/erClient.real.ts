import { isAxiosError } from 'axios'

import { apiClient } from '@/api/client'
import type { EternalReturnClient } from '@/api/erClient'
import type { ApiErrorCode, ApiResult } from '@/types/api'
import type { ProfileEntryFreshnessResult } from '@/types/api'
import type { MatchSummary, Paginated } from '@/types/match'
import type { PlayerAnalysisResponseDTO } from '@/types/playerAnalysis'
import type { PlayerFetchOptions, PlayerSeasonAggregateDTO, PlayerStats, PlayerSummary } from '@/types/player'
import { mapApiPlayerSeasons, type ApiPlayerSeasons } from '@/types/season'
import { ApiError, throwApiError } from '@/utils/apiError'
import { mapSearchErrorToUserMessage } from '@/utils/searchErrorMessage'

// 백엔드 BSER 프록시(backend/src/routes/players.ts) 클라이언트.
// BSER 직접 호출 금지 — API 키는 백엔드에만 존재한다.

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  'PLAYER_NOT_FOUND',
  'PLAYER_IDENTITY_MISMATCH',
  'NOT_IMPLEMENTED',
  'UNAUTHORIZED',
  'DUPLICATE_FAVORITE',
  'INVALID_REQUEST',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'UPSTREAM_TIMEOUT',
])

function parseErrorPayload(data: unknown): { code: ApiErrorCode; message: string } | null {
  if (typeof data !== 'object' || data === null) return null
  const error = (data as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (typeof code !== 'string' || !KNOWN_ERROR_CODES.has(code)) return null
  return {
    code: code as ApiErrorCode,
    message: typeof message === 'string' ? message : 'Request failed',
  }
}

function trimNickname(nickname: string): string {
  return nickname.trim()
}

function buildProfileQueryParams(
  options?: PlayerFetchOptions,
): Record<string, string | number | boolean> | undefined {
  if (!options) return undefined
  const params: Record<string, string | number | boolean> = {}
  if (options.userNum != null && options.userNum > 0) params.userNum = options.userNum
  if (options.uid) params.uid = options.uid
  if (options.seasonId != null && options.seasonId > 0) params.seasonId = options.seasonId
  if (options.refresh === true) params.refresh = true
  return Object.keys(params).length > 0 ? params : undefined
}

function mergeQueryParams(
  base: Record<string, string | number | boolean> | undefined,
  extra?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> | undefined {
  const merged = { ...base, ...extra }
  return Object.keys(merged).length > 0 ? merged : undefined
}

function isAbortOrTimeout(e: unknown): boolean {
  if (isAxiosError(e)) {
    if (e.code === 'ECONNABORTED') return true
    if (e.message.toLowerCase().includes('timeout')) return true
  }
  if (e instanceof DOMException && e.name === 'AbortError') return true
  if (e instanceof Error && e.name === 'AbortError') return true
  return false
}

/** 백엔드 { error: { code, message } } 응답을 ApiError로 변환 */
function toApiError(e: unknown): never {
  if (e instanceof ApiError) throw e
  if (isAbortOrTimeout(e)) {
    throwApiError(
      'UPSTREAM_TIMEOUT',
      '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
    )
  }
  if (isAxiosError(e)) {
    const payload = parseErrorPayload(e.response?.data)
    if (payload) {
      throwApiError(
        payload.code,
        mapSearchErrorToUserMessage(
          new ApiError({ code: payload.code, message: payload.message }),
        ),
      )
    }
    if (e.response) {
      throwApiError('UPSTREAM_ERROR', '검색 중 오류가 발생했습니다.')
    }
    throwApiError(
      'UPSTREAM_ERROR',
      '백엔드 서버에 연결하지 못했습니다. localhost:3001 실행 상태를 확인해 주세요.',
    )
  }
  throw e
}

const SEASONS_REQUEST_TIMEOUT_MS = 45_000
const SEASON_AGGREGATE_REQUEST_TIMEOUT_MS = 20_000
const STATS_REQUEST_TIMEOUT_MS = 25_000
const MATCHES_REQUEST_TIMEOUT_MS = 30_000
const SUMMARY_REQUEST_TIMEOUT_MS = 20_000

async function getData<T>(
  url: string,
  params?: Record<string, string | number | boolean>,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const res = await apiClient.get<ApiResult<T>>(url, {
      params,
      timeout: timeoutMs,
      signal,
    })
    return res.data.data
  } catch (e) {
    toApiError(e)
  }
}

export class RealEternalReturnClient implements EternalReturnClient {
  async searchPlayers(nickname: string): Promise<PlayerSummary[]> {
    const term = trimNickname(nickname)
    if (!term) return []
    return getData<PlayerSummary[]>('/api/players/search', { q: term }, SUMMARY_REQUEST_TIMEOUT_MS)
  }

  async fetchPlayerByNickname(
    nickname: string,
    options?: PlayerFetchOptions,
  ): Promise<PlayerSummary | null> {
    const term = trimNickname(nickname)
    if (!term) return null
    try {
      return await getData<PlayerSummary>(
        `/api/players/${encodeURIComponent(term)}/summary`,
        buildProfileQueryParams(options),
        SUMMARY_REQUEST_TIMEOUT_MS,
        options?.signal,
      )
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PLAYER_NOT_FOUND') return null
      throw e
    }
  }

  async fetchPlayerStats(nickname: string, options?: PlayerFetchOptions): Promise<PlayerStats> {
    const term = trimNickname(nickname)
    return getData<PlayerStats>(
      `/api/players/${encodeURIComponent(term)}/stats`,
      buildProfileQueryParams(options),
      STATS_REQUEST_TIMEOUT_MS,
      options?.signal,
    )
  }

  async fetchMatchHistory(
    nickname: string,
    page: number,
    pageSize: number,
    options?: PlayerFetchOptions,
  ): Promise<Paginated<MatchSummary>> {
    const term = trimNickname(nickname)
    const params = mergeQueryParams(buildProfileQueryParams(options), {
      page,
      pageSize,
      mode: options?.matchMode ?? 'all',
    })
    return getData<Paginated<MatchSummary>>(
      `/api/players/${encodeURIComponent(term)}/matches`,
      params,
      MATCHES_REQUEST_TIMEOUT_MS,
      options?.signal,
    )
  }

  async fetchPlayerSeasons(nickname: string, from: number, to: number, options?: PlayerFetchOptions) {
    const term = trimNickname(nickname)
    const raw = await getData<ApiPlayerSeasons>(
      `/api/players/${encodeURIComponent(term)}/seasons`,
      mergeQueryParams(buildProfileQueryParams(options), { from, to }),
      SEASONS_REQUEST_TIMEOUT_MS,
      options?.signal,
    )
    return mapApiPlayerSeasons(raw)
  }

  async fetchPlayerSeasonAggregate(
    nickname: string,
    seasonId: number,
    options?: PlayerFetchOptions,
  ): Promise<PlayerSeasonAggregateDTO> {
    const term = trimNickname(nickname)
    return getData<PlayerSeasonAggregateDTO>(
      `/api/players/${encodeURIComponent(term)}/season-aggregate`,
      mergeQueryParams(buildProfileQueryParams(options), { seasonId }),
      SEASON_AGGREGATE_REQUEST_TIMEOUT_MS,
    )
  }

  async fetchProfileEntryFreshness(
    nickname: string,
    options?: PlayerFetchOptions,
  ): Promise<ProfileEntryFreshnessResult> {
    const term = trimNickname(nickname)
    return getData<ProfileEntryFreshnessResult>(
      `/api/players/${encodeURIComponent(term)}/entry-freshness`,
      buildProfileQueryParams(options),
      120_000,
      options?.signal,
    )
  }

  async fetchPlayerAnalysis(
    nickname: string,
    options?: PlayerFetchOptions,
  ): Promise<PlayerAnalysisResponseDTO> {
    const term = trimNickname(nickname)
    return getData<PlayerAnalysisResponseDTO>(
      `/api/players/${encodeURIComponent(term)}/analysis`,
      mergeQueryParams(buildProfileQueryParams(options), { scope: 'rank' }),
      STATS_REQUEST_TIMEOUT_MS,
      options?.signal,
    )
  }
}
