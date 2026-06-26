import { describe, expect, it } from 'vitest'

import { ApiError } from '@/utils/apiError'
import {
  mapMatchDetailErrorToUserMessage,
  MATCH_DETAIL_NOT_FOUND_MESSAGE,
} from '@/utils/matchDetailErrorMessage'

describe('mapMatchDetailErrorToUserMessage', () => {
  it('NOT_FOUND', () => {
    expect(
      mapMatchDetailErrorToUserMessage(
        new ApiError({ code: 'NOT_FOUND', message: 'missing' }),
      ),
    ).toBe(MATCH_DETAIL_NOT_FOUND_MESSAGE)
  })

  it('RATE_LIMITED', () => {
    expect(
      mapMatchDetailErrorToUserMessage(
        new ApiError({ code: 'RATE_LIMITED', message: 'limited' }),
      ),
    ).toBe('요청 제한으로 잠시 후 다시 시도해 주세요.')
  })

  it('UPSTREAM_TIMEOUT', () => {
    expect(
      mapMatchDetailErrorToUserMessage(
        new ApiError({ code: 'UPSTREAM_TIMEOUT', message: 'slow' }),
      ),
    ).toBe('응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')
  })
})
