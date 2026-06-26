import { describe, expect, it } from 'vitest'

import {
  PROFILE_NOT_FOUND_DESCRIPTION,
  PROFILE_NOT_FOUND_TITLE,
  shouldShowProfileFatalError,
  shouldShowQuerySectionError,
} from '@/utils/playerError'
import { ApiError } from '@/utils/apiError'

describe('playerError', () => {
  it('shows fatal not-found only for explicit missing summary', () => {
    expect(
      shouldShowProfileFatalError({
        nickname: '하잉',
        requestedNickname: '하잉',
        summaryQuery: {
          isError: false,
          isFetching: false,
          isSuccess: true,
          data: null,
          error: null,
        },
        hasDbSummary: false,
      }),
    ).toBe(true)
  })

  it('does not show fatal not-found when summary data exists', () => {
    expect(
      shouldShowProfileFatalError({
        nickname: '하잉',
        requestedNickname: '하잉',
        summaryQuery: {
          isError: false,
          isFetching: false,
          isSuccess: true,
          data: { nickname: '하잉' },
          error: null,
        },
        hasDbSummary: true,
      }),
    ).toBe(false)
  })

  it('does not show fatal not-found for stale nickname', () => {
    expect(
      shouldShowProfileFatalError({
        nickname: '하잉',
        requestedNickname: '다른닉',
        summaryQuery: {
          isError: true,
          isFetching: false,
          isSuccess: false,
          data: undefined,
          error: new ApiError({ code: 'PLAYER_NOT_FOUND', message: 'x' }),
        },
        hasDbSummary: false,
      }),
    ).toBe(false)
  })

  it('hides section error when success data exists', () => {
    expect(
      shouldShowQuerySectionError({
        isError: true,
        isFetching: false,
        isSuccess: true,
        data: { games: 1 },
      }),
    ).toBe(false)
  })

  it('uses user-facing not-found copy constants', () => {
    expect(PROFILE_NOT_FOUND_TITLE).toBe('플레이어를 찾지 못했어요')
    expect(PROFILE_NOT_FOUND_DESCRIPTION).toContain('닉네임을 확인')
  })
})
