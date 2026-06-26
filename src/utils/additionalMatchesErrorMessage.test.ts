import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'

import { ApiError } from '@/utils/apiError'
import { mapAdditionalMatchesErrorToUserMessage } from '@/utils/additionalMatchesErrorMessage'

describe('mapAdditionalMatchesErrorToUserMessage', () => {
  it('UPSTREAM_TIMEOUT', () => {
    expect(
      mapAdditionalMatchesErrorToUserMessage(
        new ApiError({
          code: 'UPSTREAM_TIMEOUT',
          message: '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
        }),
      ),
    ).toBe('공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')
  })

  it('RATE_LIMITED', () => {
    expect(
      mapAdditionalMatchesErrorToUserMessage(
        new ApiError({ code: 'RATE_LIMITED', message: 'limited' }),
      ),
    ).toBe('공식 API 요청 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.')
  })

  it('network', () => {
    expect(mapAdditionalMatchesErrorToUserMessage(new AxiosError('Network Error'))).toBe(
      '백엔드 서버에 연결하지 못했습니다. localhost:3001 실행 상태를 확인해 주세요.',
    )
  })

  it('unknown', () => {
    expect(mapAdditionalMatchesErrorToUserMessage(new Error('x'))).toBe(
      '추가 경기 기록을 불러오지 못했습니다.',
    )
  })
})
