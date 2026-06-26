import { isAxiosError } from 'axios'

import { ApiError } from '@/utils/apiError'
import { PROFILE_IDENTITY_MISMATCH_MESSAGE } from '@/utils/profileIdentityMessage'

const UNSAFE_MESSAGE = /api[_-]?key|x-api-key|bser_api_key|forbidden|upstream/i

function sanitizeBackendMessage(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed || UNSAFE_MESSAGE.test(trimmed)) return null
  return trimmed
}

export function isAbortOrTimeoutError(error: unknown): boolean {
  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return true
    if (error.message.toLowerCase().includes('timeout')) return true
  }
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return false
}

/** 검색·프로필 조회용 사용자 메시지 (API key·upstream 원문 노출 금지) */
export function mapSearchErrorToUserMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError) {
    const safe = sanitizeBackendMessage(error.message)
    switch (error.code) {
      case 'INVALID_REQUEST':
        return safe ?? '닉네임을 입력해 주세요.'
      case 'PLAYER_NOT_FOUND':
        return '플레이어를 찾을 수 없습니다. 닉네임을 정확히 입력해 주세요.'
      case 'PLAYER_IDENTITY_MISMATCH':
        return PROFILE_IDENTITY_MISMATCH_MESSAGE
      case 'UPSTREAM_TIMEOUT':
        return '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
      case 'UPSTREAM_ERROR':
        if (safe?.includes('연결하지 못했습니다')) return safe
        return '공식 API 연결을 확인할 수 없습니다. 서버 설정을 확인해 주세요.'
      case 'RATE_LIMITED':
        return '공식 API 요청 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.'
      default:
        return safe ?? fallback ?? '검색 중 오류가 발생했습니다.'
    }
  }

  if (isAbortOrTimeoutError(error)) {
    return '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (isAxiosError(error)) {
    if (!error.response) {
      return '백엔드 서버에 연결하지 못했습니다. localhost:3001 실행 상태를 확인해 주세요.'
    }
    const payload = error.response.data
    if (typeof payload === 'object' && payload !== null) {
      const nested = (payload as { error?: { code?: unknown; message?: unknown } }).error
      if (nested && typeof nested.code === 'string') {
        const mapped = mapSearchErrorToUserMessage(
          new ApiError({
            code: nested.code as ApiError['code'],
            message: typeof nested.message === 'string' ? nested.message : 'Request failed',
          }),
        )
        if (mapped) return mapped
      }
      if (typeof nested?.message === 'string') {
        const safe = sanitizeBackendMessage(nested.message)
        if (safe) return safe
      }
    }
  }

  if (error instanceof Error) {
    const safe = sanitizeBackendMessage(error.message)
    if (safe) return safe
  }

  return fallback ?? '검색 중 오류가 발생했습니다.'
}
