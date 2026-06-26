import { isAxiosError } from 'axios'

import { ApiError } from '@/utils/apiError'
import { PROFILE_REFRESH_ERROR } from '@/utils/playerError'
import { isAbortOrTimeoutError } from '@/utils/searchErrorMessage'

/** 전적 갱신 버튼용 사용자 메시지 */
export function mapProfileRefreshErrorToUserMessage(error: unknown): string {
  if (isAbortOrTimeoutError(error)) {
    return PROFILE_REFRESH_ERROR
  }

  if (error instanceof ApiError) {
    switch (error.code) {
      case 'PLAYER_NOT_FOUND':
      case 'UPSTREAM_ERROR':
      case 'UPSTREAM_TIMEOUT':
      case 'RATE_LIMITED':
        return PROFILE_REFRESH_ERROR
      default:
        break
    }
  }

  if (isAxiosError(error) && !error.response) {
    return PROFILE_REFRESH_ERROR
  }

  return PROFILE_REFRESH_ERROR
}
