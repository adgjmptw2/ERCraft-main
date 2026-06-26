import type { BserUserGame } from '../external/bserClient.js'
import type { CollectorConfig } from './config.js'
import { qualifiesForDeepVerification } from './identityPriority.js'
import type { IdentityVerificationTarget, IdentityVerificationTier } from './identityVerification.js'

export interface GroupVerificationCandidate {
  candidateId: string
  target: IdentityVerificationTarget
  sourcePlayedAtMs: number | null
}

export type GroupCandidateOutcome =
  | 'resolved'
  | 'unresolved-game-mismatch'
  | 'unresolved-game-out-of-window'
  | 'pending'

export interface GroupVerificationPageResult {
  outcomes: Map<string, GroupCandidateOutcome>
  totalPages: number
  resolvedTier: IdentityVerificationTier | 'out-of-window' | null
  stoppedReason: string
  candidateGameIdsChecked: number
}

function readGameStartMs(game: BserUserGame): number | null {
  const raw = game.startDtm
  if (typeof raw !== 'string' || !raw.trim()) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function participantMatchKey(game: BserUserGame): string {
  return `${game.nickname ?? ''}:${game.teamNumber ?? 0}:${game.characterNum}`
}

export function matchesVerificationTarget(
  game: BserUserGame,
  target: IdentityVerificationTarget,
): boolean {
  if (String(game.gameId) !== target.sourceGameId) return false
  if (participantMatchKey(game) !== `${target.nickname}:${target.teamNumber}:${target.characterNum}`) {
    return false
  }
  if (target.matchingMode != null && game.matchingMode != null && game.matchingMode !== target.matchingMode) {
    return false
  }
  if (target.seasonId != null && game.seasonId != null && game.seasonId !== target.seasonId) {
    return false
  }
  return true
}

function pageEntirelyPastWindowForCandidates(
  games: ReadonlyArray<BserUserGame>,
  pending: ReadonlyArray<GroupVerificationCandidate>,
): boolean {
  if (games.length === 0 || pending.length === 0) return false
  const times = games.map(readGameStartMs).filter((value): value is number => value != null)
  if (times.length === 0) return false
  const newestOnPage = Math.max(...times)
  const marginMs = 6 * 60 * 60 * 1000
  const newestSource = Math.max(
    ...pending
      .map((c) => c.sourcePlayedAtMs)
      .filter((value): value is number => value != null),
  )
  if (!Number.isFinite(newestSource)) return false
  const gameIdsOnPage = new Set(games.map((g) => String(g.gameId)))
  const anySourceOnPage = pending.some((c) => gameIdsOnPage.has(c.target.sourceGameId))
  if (anySourceOnPage) return false
  return newestOnPage < newestSource - marginMs
}

export async function verifyGroupWithTieredPages(
  config: CollectorConfig,
  params: {
    priority: number
    candidates: GroupVerificationCandidate[]
    fetchPage: (cursor?: number) => Promise<{ games: BserUserGame[]; next?: number } | null>
  },
): Promise<GroupVerificationPageResult> {
  const outcomes = new Map<string, GroupCandidateOutcome>()
  for (const candidate of params.candidates) {
    outcomes.set(candidate.candidateId, 'pending')
  }

  const deepAllowed = qualifiesForDeepVerification(
    params.priority,
    config.identityDeepPriorityThreshold,
    config.identityDeepEnabled,
  )
  const maxPages = deepAllowed ? config.identityDeepPages : config.identityNormalPages
  const quickLimit = config.identityQuickPages

  const seenCursors = new Set<string>()
  const seenGameIds = new Set<string>()
  let cursor: number | undefined
  let pagesUsed = 0
  let stoppedReason = 'page-limit'
  let candidateGameIdsChecked = 0
  let resolvedTier: IdentityVerificationTier | 'out-of-window' | null = null

  const pendingIds = (): string[] =>
    [...outcomes.entries()].filter(([, v]) => v === 'pending').map(([id]) => id)

  while (pagesUsed < maxPages && pendingIds().length > 0) {
    const cursorKey = cursor == null ? 'start' : String(cursor)
    if (seenCursors.has(cursorKey)) {
      stoppedReason = 'duplicate-page'
      break
    }
    seenCursors.add(cursorKey)

    const page = await params.fetchPage(cursor)
    if (!page) {
      stoppedReason = 'budget'
      break
    }
    pagesUsed += 1
    if (pagesUsed <= quickLimit) resolvedTier = 'quick'
    else if (deepAllowed && pagesUsed > config.identityNormalPages) resolvedTier = 'deep'
    else resolvedTier = 'normal'

    if (page.games.length === 0) {
      stoppedReason = 'empty-page'
      break
    }

    const stillPending = params.candidates.filter((c) => outcomes.get(c.candidateId) === 'pending')

    for (const game of page.games) {
      const gameId = String(game.gameId)
      if (seenGameIds.has(gameId)) {
        stoppedReason = 'duplicate-page'
        break
      }
      seenGameIds.add(gameId)
      candidateGameIdsChecked += 1

      for (const candidate of stillPending) {
        if (outcomes.get(candidate.candidateId) !== 'pending') continue
        if (matchesVerificationTarget(game, candidate.target)) {
          outcomes.set(candidate.candidateId, 'resolved')
        }
      }
    }

    if (stoppedReason === 'duplicate-page') break

    if (pendingIds().length === 0) {
      stoppedReason = 'found'
      break
    }

    if (pageEntirelyPastWindowForCandidates(page.games, stillPending)) {
      stoppedReason = 'past-window'
      for (const id of pendingIds()) {
        outcomes.set(id, 'unresolved-game-out-of-window')
      }
      resolvedTier = 'out-of-window'
      break
    }

    if (!page.next) {
      stoppedReason = 'last-page'
      break
    }
    cursor = page.next
  }

  if (stoppedReason === 'last-page' || stoppedReason === 'page-limit' || stoppedReason === 'empty-page') {
    for (const id of pendingIds()) {
      outcomes.set(id, 'unresolved-game-mismatch')
    }
  }

  return {
    outcomes,
    totalPages: pagesUsed,
    resolvedTier,
    stoppedReason,
    candidateGameIdsChecked,
  }
}
