import type { UseQueryResult } from '@tanstack/react-query'

import { ApiError } from '@/utils/apiError'
import { isAbortOrTimeoutError } from '@/utils/searchErrorMessage'

export const PROFILE_NOT_FOUND_TITLE = '플레이어를 찾지 못했어요'
export const PROFILE_NOT_FOUND_DESCRIPTION =
  '닉네임을 확인한 뒤 다시 검색해 주세요.'
export const PROFILE_SECTION_ERROR = '이 항목을 불러오지 못했어요.'
export const PROFILE_REFRESH_ERROR =
  '전적을 갱신하지 못했어요. 잠시 후 다시 시도해 주세요.'
export const PROFILE_STATS_SECTION_ERROR = '통계 데이터를 불러오지 못했어요.'
export const PROFILE_MATCHES_SECTION_ERROR = '전적 목록을 불러오지 못했어요.'
export const PROFILE_SEASONS_SECTION_ERROR =
  '시즌 기록을 불러오지 못했어요. 잠시 후 전적 갱신을 시도해 주세요.'

export function isPlayerNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'PLAYER_NOT_FOUND'
}

export function shouldShowProfileFatalError(params: {
  nickname: string
  requestedNickname: string
  summaryQuery: Pick<
    UseQueryResult,
    'isError' | 'isFetching' | 'isSuccess' | 'data' | 'error'
  >
  hasDbSummary: boolean
}): boolean {
  const { nickname, requestedNickname, summaryQuery, hasDbSummary } = params
  if (nickname !== requestedNickname) return false
  if (hasDbSummary) return false
  if (summaryQuery.isFetching) return false
  if (summaryQuery.isSuccess && summaryQuery.data != null) return false
  if (summaryQuery.isSuccess && summaryQuery.data == null) return true
  if (
    summaryQuery.isError &&
    !summaryQuery.isFetching &&
    isPlayerNotFoundError(summaryQuery.error)
  ) {
    return true
  }
  return false
}

export function shouldShowQuerySectionError(
  query: Pick<UseQueryResult, 'isError' | 'isFetching' | 'isSuccess' | 'data'>,
): boolean {
  if (!query.isError || query.isFetching) return false
  if (query.isSuccess && query.data != null) return false
  return true
}

export function isIgnorableRequestError(error: unknown): boolean {
  return isAbortOrTimeoutError(error)
}
