import { isAxiosError } from 'axios'

import { ApiError } from '@/utils/apiError'
import { mapSearchErrorToUserMessage } from '@/utils/searchErrorMessage'

/** 추가 경기 페이지 로드 실패 — 사용자 메시지 */
export function mapAdditionalMatchesErrorToUserMessage(error: unknown): string {
  const fallback = '추가 경기 기록을 불러오지 못했습니다.'

  if (error instanceof ApiError) {
    return mapSearchErrorToUserMessage(error, fallback)
  }

  if (isAxiosError(error)) {
    if (!error.response) {
      return '백엔드 서버에 연결하지 못했습니다. localhost:3001 실행 상태를 확인해 주세요.'
    }
    return mapSearchErrorToUserMessage(error, fallback)
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'))
  ) {
    return '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
  }

  return fallback
}
