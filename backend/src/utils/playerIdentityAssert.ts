import type { FastifyBaseLogger } from 'fastify'

import { HttpError } from './httpError.js'
import type { ResolvedProfileIdentity } from './resolvedProfileIdentity.js'

export interface PlayerIdentityAssertContext {
  endpoint: string
  requestedNickname: string
  expectedUserNum: number
  actualUserNum: number | null | undefined
  normalizedNickname?: string
  cacheSource?: string
}

const IDENTITY_MISMATCH_MESSAGE =
  '플레이어 정보를 확인하는 중 문제가 발생했습니다. 다시 검색해 주세요.'

function isDevEnv(): boolean {
  return process.env.NODE_ENV === 'development'
}

/** endpoint DTO userNum이 resolve된 기준 identity와 일치하는지 검증 */
export function assertPlayerIdentityUserNum(
  logger: FastifyBaseLogger | undefined,
  context: PlayerIdentityAssertContext,
): void {
  const { expectedUserNum, actualUserNum, endpoint, requestedNickname } = context
  if (expectedUserNum <= 0 || !Number.isFinite(expectedUserNum)) return
  if (actualUserNum == null || !Number.isFinite(actualUserNum) || actualUserNum <= 0) return
  if (actualUserNum === expectedUserNum) return

  if (logger && isDevEnv()) {
    logger.warn(
      {
        event: 'player-identity-mismatch',
        endpoint,
        requestedNickname,
        normalizedNickname:
          context.normalizedNickname ?? requestedNickname.trim().toLowerCase(),
        expectedUserNum,
        actualUserNum,
        cacheSource: context.cacheSource,
      },
      'player identity mismatch blocked',
    )
  }

  throw new HttpError(409, 'PLAYER_IDENTITY_MISMATCH', IDENTITY_MISMATCH_MESSAGE)
}

/** BSER lookup uid와 canonical uid가 다르면 verified alias로만 허용 */
export function assertResolvedProfileIdentity(
  logger: FastifyBaseLogger | undefined,
  identity: ResolvedProfileIdentity,
  endpoint: string,
): void {
  const profileUid = identity.sources.profileUid
  const canonicalUid = identity.owner.canonicalUid
  if (!profileUid || profileUid === canonicalUid) return
  if (identity.verification.verifiedAliasUids.includes(profileUid)) return
  // BSER nickname lookup uid는 PlayerMatch 소유권 기준 — canonical 병합과 분리
  return
}

export function assertMatchesPageIdentity(
  logger: FastifyBaseLogger | undefined,
  context: Omit<PlayerIdentityAssertContext, 'actualUserNum'> & {
    items: ReadonlyArray<{ userNum?: number }>
  },
): void {
  for (const item of context.items) {
    assertPlayerIdentityUserNum(logger, {
      ...context,
      actualUserNum: item.userNum,
    })
  }
}
