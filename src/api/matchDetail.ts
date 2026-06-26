import { isAxiosError } from 'axios'

import { apiClient } from '@/api/client'
import type { ApiErrorCode, ApiResult, MatchDetailFetchMeta } from '@/types/api'
import type { MatchDetailDTO } from '@/types/matchDetail'
import { ApiError, throwApiError } from '@/utils/apiError'

export interface MatchDetailResult extends ApiResult<MatchDetailDTO> {
  fetchMeta?: MatchDetailFetchMeta
}

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  'NOT_FOUND',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'UPSTREAM_TIMEOUT',
  'INTERNAL_ERROR',
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

function toApiError(e: unknown): never {
  if (e instanceof ApiError) throw e
  if (isAxiosError(e)) {
    if (e.code === 'ECONNABORTED' || e.message.toLowerCase().includes('timeout')) {
      throwApiError('UPSTREAM_TIMEOUT', '응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')
    }
    const payload = parseErrorPayload(e.response?.data)
    if (payload) {
      throw new ApiError({ code: payload.code, message: payload.message })
    }
    if (e.response?.status === 404) {
      throwApiError('NOT_FOUND', '매치 상세 데이터를 찾을 수 없습니다.')
    }
    throwApiError('UPSTREAM_ERROR', '매치 상세 처리 중 문제가 발생했습니다.')
  }
  throw e
}

export async function fetchMatchDetail(gameId: string): Promise<MatchDetailResult> {
  const trimmed = gameId.trim()
  const res = await apiClient
    .get<ApiResult<MatchDetailDTO>>(`/api/matches/${encodeURIComponent(trimmed)}/detail`)
    .catch((e: unknown) => toApiError(e))
  return {
    data: res.data.data,
    source: res.data.source,
    refreshedAt: res.data.refreshedAt,
    fetchMeta: res.data.fetchMeta,
  }
}
