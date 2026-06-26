import { describe, expect, it } from 'vitest'

import { mapProfileRefreshErrorToUserMessage } from '@/utils/profileRefreshErrorMessage'
import { ApiError } from '@/utils/apiError'
import { PROFILE_REFRESH_ERROR } from '@/utils/playerError'

describe('mapProfileRefreshErrorToUserMessage', () => {
  it('404 PLAYER_NOT_FOUND', () => {
    expect(
      mapProfileRefreshErrorToUserMessage(
        new ApiError({ code: 'PLAYER_NOT_FOUND', message: 'hidden' }),
      ),
    ).toBe(PROFILE_REFRESH_ERROR)
  })

  it('503 UPSTREAM_ERROR', () => {
    expect(
      mapProfileRefreshErrorToUserMessage(
        new ApiError({ code: 'UPSTREAM_ERROR', message: 'BSER_API_KEY missing' }),
      ),
    ).toBe(PROFILE_REFRESH_ERROR)
  })

  it('API key 문자열이 메시지에 노출되지 않음', () => {
    const message = mapProfileRefreshErrorToUserMessage(
      new ApiError({ code: 'UPSTREAM_ERROR', message: 'BSER_API_KEY invalid' }),
    )
    expect(message.toLowerCase()).not.toContain('bser_api_key')
    expect(message.toLowerCase()).not.toContain('api key')
  })
})
