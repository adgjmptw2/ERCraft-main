import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/utils/apiError'
import { mapSearchErrorToUserMessage } from '@/utils/searchErrorMessage'

describe('mapSearchErrorToUserMessage', () => {
  it('404 PLAYER_NOT_FOUND', () => {
    expect(
      mapSearchErrorToUserMessage(
        new ApiError({ code: 'PLAYER_NOT_FOUND', message: 'Player not found' }),
      ),
    ).toBe('플레이어를 찾을 수 없습니다. 닉네임을 정확히 입력해 주세요.')
  })

  it('503 UPSTREAM_ERROR — API key 문구 숨김', () => {
    expect(
      mapSearchErrorToUserMessage(
        new ApiError({
          code: 'UPSTREAM_ERROR',
          message: 'BSER_API_KEY is not configured',
        }),
      ),
    ).toBe('공식 API 연결을 확인할 수 없습니다. 서버 설정을 확인해 주세요.')
  })

  it('504 UPSTREAM_TIMEOUT', () => {
    expect(
      mapSearchErrorToUserMessage(
        new ApiError({
          code: 'UPSTREAM_TIMEOUT',
          message: '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
        }),
      ),
    ).toBe('공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')
  })

  it('RATE_LIMITED', () => {
    expect(
      mapSearchErrorToUserMessage(new ApiError({ code: 'RATE_LIMITED', message: 'limited' })),
    ).toBe('공식 API 요청 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.')
  })

  it('axios timeout — network와 구분', () => {
    const err = new AxiosError('timeout of 15000ms exceeded')
    err.code = 'ECONNABORTED'
    expect(mapSearchErrorToUserMessage(err)).toBe(
      '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
    )
  })

  it('400 INVALID_REQUEST', () => {
    expect(
      mapSearchErrorToUserMessage(
        new ApiError({ code: 'INVALID_REQUEST', message: '닉네임을 입력해 주세요.' }),
      ),
    ).toBe('닉네임을 입력해 주세요.')
  })

  it('네트워크 오류', () => {
    const err = new AxiosError('Network Error')
    expect(mapSearchErrorToUserMessage(err)).toBe(
      '백엔드 서버에 연결하지 못했습니다. localhost:3001 실행 상태를 확인해 주세요.',
    )
  })
})
