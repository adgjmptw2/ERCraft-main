import type { ProfileRefreshMeta } from './profileRefreshState.js'
import { readProfileLatestGameId, recordRecentMatchCheckSuccess } from './profileRefreshState.js'
import {
  readEntryPeekVerified,
  rememberEntryPeekVerified,
  resetProfileEntryPeekCacheForTests,
} from './profileEntryPeekCache.js'
import {
  coordinateFreshnessWork,
  isRecentMatchFreshnessInflight,
  runRecentMatchFreshnessCheck,
  type RecentMatchFreshnessDeps,
} from './recentMatchFreshness.js'

export type ProfileEntryFreshnessStatus =
  | 'already-fresh'
  | 'collected'
  | 'upstream-game-list-stale'
  | 'skipped-no-profile-cache'
  | 'skipped-inflight'
  | 'failed'

export interface ProfileEntryFreshnessResult extends ProfileRefreshMeta {
  status: ProfileEntryFreshnessStatus
  upstreamLatestGameId: string | null
}

export interface ProfileEntryFreshnessDeps extends RecentMatchFreshnessDeps {
  playerMatchUids: string[]
  peekUpstreamLatestGameId: () => Promise<string | null>
  finalizeAfterCollect: (params: {
    latestGameIdBefore: string | null
    newGamesInserted: number
    gamesFetched: number
    playerMatchUpsertFailed?: boolean
  }) => Promise<ProfileRefreshMeta>
}

export function resetProfileEntryFreshnessForTests(): void {
  resetProfileEntryPeekCacheForTests()
}

export function isProfileEntryFreshnessInflight(canonicalUid: string): boolean {
  return isRecentMatchFreshnessInflight(canonicalUid)
}

function buildAlreadyFreshResult(params: {
  dbLatest: string | null
  upstreamLatest: string | null
  now: Date
}): ProfileEntryFreshnessResult {
  return {
    status: 'already-fresh',
    rankUpdated: false,
    latestGameIdBefore: params.dbLatest,
    latestGameIdAfter: params.dbLatest,
    upstreamLatestGameId: params.upstreamLatest,
    gamesFetched: 0,
    newGamesInserted: 0,
    matchesUpdated: false,
    statsInvalidated: false,
    aggregateInvalidated: false,
    snapshotInvalidatedOrRebuilt: false,
    refreshCompletedAt: params.now.toISOString(),
    skipReason: 'no-new-games',
  }
}

async function runEntryFreshnessOnce(
  deps: ProfileEntryFreshnessDeps,
): Promise<ProfileEntryFreshnessResult> {
  const now = deps.now ?? new Date()

  if (!deps.hasProfileCache) {
    return {
      ...buildAlreadyFreshResult({ dbLatest: null, upstreamLatest: null, now }),
      status: 'skipped-no-profile-cache',
      skipReason: undefined,
    }
  }

  const dbLatest = await readProfileLatestGameId(deps.prisma, deps.playerMatchUids)
  const cachedPeek = readEntryPeekVerified(deps.canonicalUid, now)
  if (cachedPeek && cachedPeek.dbGameId === dbLatest) {
    return buildAlreadyFreshResult({
      dbLatest,
      upstreamLatest: cachedPeek.upstreamGameId,
      now,
    })
  }

  let upstreamLatest: string | null = null
  try {
    upstreamLatest = await deps.peekUpstreamLatestGameId()
  } catch (err) {
    deps.logger.warn(
      { err, nickname: deps.nickname, canonicalUid: deps.canonicalUid },
      'profile entry freshness upstream peek failed',
    )
    return {
      ...buildAlreadyFreshResult({ dbLatest, upstreamLatest: null, now }),
      status: 'failed',
      skipReason: 'upstream-game-list-stale',
      partialFailure: 'upstream-peek-failed',
    }
  }

  if (dbLatest !== null && upstreamLatest !== null && dbLatest === upstreamLatest) {
    rememberEntryPeekVerified(deps.canonicalUid, dbLatest, upstreamLatest, now)
    await recordRecentMatchCheckSuccess(deps.prisma, deps.canonicalUid, now)
    return buildAlreadyFreshResult({ dbLatest, upstreamLatest, now })
  }

  if (upstreamLatest === null) {
    return {
      ...buildAlreadyFreshResult({ dbLatest, upstreamLatest: null, now }),
      status: 'upstream-game-list-stale',
      skipReason: 'upstream-game-list-stale',
    }
  }

  const collected = await runRecentMatchFreshnessCheck(deps, { force: true })
  const newGamesInserted = collected?.newMatchCount ?? 0
  const gamesFetched = collected?.pagesFetched ?? 0

  const finalized = await deps.finalizeAfterCollect({
    latestGameIdBefore: dbLatest,
    newGamesInserted,
    gamesFetched,
    playerMatchUpsertFailed: collected == null,
  })

  const latestAfter = finalized.latestGameIdAfter
  rememberEntryPeekVerified(deps.canonicalUid, latestAfter, upstreamLatest, now)

  if (newGamesInserted > 0) {
    return {
      ...finalized,
      status: 'collected',
      upstreamLatestGameId: upstreamLatest,
      matchesUpdated: true,
      skipReason: undefined,
    }
  }

  if (latestAfter !== null && latestAfter === upstreamLatest) {
    return {
      ...finalized,
      status: 'already-fresh',
      upstreamLatestGameId: upstreamLatest,
      skipReason: 'already-ingested',
    }
  }

  return {
    ...finalized,
    status: 'upstream-game-list-stale',
    upstreamLatestGameId: upstreamLatest,
    skipReason: 'upstream-game-list-stale',
  }
}

export async function coordinateProfileEntryFreshness(
  deps: ProfileEntryFreshnessDeps,
): Promise<ProfileEntryFreshnessResult> {
  return coordinateFreshnessWork(deps.canonicalUid, () => runEntryFreshnessOnce(deps))
}