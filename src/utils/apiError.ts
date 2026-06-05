import type { ApiErrorCode } from '@/types/api'

export interface ApiErrorPayload {
  code: ApiErrorCode
  message: string
  details?: unknown
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly details?: unknown
  readonly error: ApiErrorPayload

  constructor({ code, message, details }: ApiErrorPayload) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.error = { code, message, details }
  }
}

export function throwApiError(code: ApiErrorCode, message: string, details?: unknown): never {
  throw new ApiError({ code, message, details })
}
