import type { ApiErrorCode } from '../types/api.js'

export class HttpError extends Error {
  readonly statusCode: number
  readonly code: ApiErrorCode
  readonly details?: unknown

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}
