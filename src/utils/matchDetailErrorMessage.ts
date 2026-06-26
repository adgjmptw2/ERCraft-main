import { isAxiosError } from 'axios'

import { ApiError } from '@/utils/apiError'

/** 매치 상세 lazy load용 사용자 메시지 */
export function mapMatchDetailErrorToUserMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return '매치 상세 데이터를 찾을 수 없습니다.'
      case 'RATE_LIMITED':
        return '요청 제한으로 잠시 후 다시 시도해 주세요.'
      case 'UPSTREAM_TIMEOUT':
        return '응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
      case 'UPSTREAM_ERROR':
      case 'INTERNAL_ERROR':
        return '매치 상세 처리 중 문제가 발생했습니다.'
      default:
        break
    }
  }

  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
      return '응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
    }
    if (!error.response) {
      return '매치 상세 처리 중 문제가 발생했습니다.'
    }
  }

  return '매치 상세 처리 중 문제가 발생했습니다.'
}

export const MATCH_DETAIL_MISSING_GAME_ID_MESSAGE =
  '매치 식별자가 없어 상세를 불러올 수 없습니다.'

export const MATCH_DETAIL_NOT_FOUND_MESSAGE = '매치 상세 데이터를 찾을 수 없습니다.'
