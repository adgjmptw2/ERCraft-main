import { describe, expect, it } from 'vitest'

import { HttpError } from './httpError.js'
import {
  assertMatchesPageIdentity,
  assertPlayerIdentityUserNum,
  assertResolvedProfileIdentity,
} from './playerIdentityAssert.js'

describe('playerIdentityAssert', () => {
  it('expected와 actual userNum이 같으면 통과', () => {
    expect(() =>
      assertPlayerIdentityUserNum(undefined, {
        endpoint: 'stats',
        requestedNickname: 'alice',
        expectedUserNum: 100,
        actualUserNum: 100,
      }),
    ).not.toThrow()
  })

  it('userNum 불일치면 PLAYER_IDENTITY_MISMATCH', () => {
    expect(() =>
      assertPlayerIdentityUserNum(undefined, {
        endpoint: 'stats',
        requestedNickname: 'alice',
        expectedUserNum: 100,
        actualUserNum: 200,
      }),
    ).toThrow(HttpError)

    try {
      assertPlayerIdentityUserNum(undefined, {
        endpoint: 'stats',
        requestedNickname: 'alice',
        expectedUserNum: 100,
        actualUserNum: 200,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      const httpError = error as HttpError
      expect(httpError.statusCode).toBe(409)
      expect(httpError.code).toBe('PLAYER_IDENTITY_MISMATCH')
    }
  })

  it('actual userNum이 없으면 검증 스킵', () => {
    expect(() =>
      assertPlayerIdentityUserNum(undefined, {
        endpoint: 'summary',
        requestedNickname: 'alice',
        expectedUserNum: 100,
        actualUserNum: null,
      }),
    ).not.toThrow()
  })

  it('matches page의 모든 item userNum을 검증한다', () => {
    expect(() =>
      assertMatchesPageIdentity(undefined, {
        endpoint: 'matches',
        requestedNickname: 'alice',
        expectedUserNum: 100,
        items: [{ userNum: 100 }, { userNum: 200 }],
      }),
    ).toThrow(HttpError)
  })

  it('BSER profileUid가 canonical과 달라도 허용 (PlayerMatch 소유권 분리)', () => {
    expect(() =>
      assertResolvedProfileIdentity(undefined, {
        requestedNickname: 'player-a',
        normalizedNickname: 'player-a',
        owner: { canonicalUid: 'uid-wrong', canonicalUserNum: 200 },
        sources: { profileUid: 'uid-bser', seasonUids: [], playerMatchUids: ['uid-wrong'] },
        verification: {
          method: 'canonical',
          status: 'partial',
          verifiedAliasUids: [],
        },
        resolvedAt: new Date().toISOString(),
      }, 'summary'),
    ).not.toThrow()
  })

  it('verified alias가 있으면 canonical swap 허용', () => {
    expect(() =>
      assertResolvedProfileIdentity(undefined, {
        requestedNickname: 'player-a',
        normalizedNickname: 'player-a',
        owner: { canonicalUid: 'uid-canonical', canonicalUserNum: 200 },
        sources: { profileUid: 'uid-bser', seasonUids: [], playerMatchUids: ['uid-canonical'] },
        verification: {
          method: 'known-alias',
          status: 'complete',
          verifiedAliasUids: ['uid-bser'],
        },
        resolvedAt: new Date().toISOString(),
      }, 'summary'),
    ).not.toThrow()
  })
})
