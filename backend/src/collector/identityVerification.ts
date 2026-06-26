import type { BserUserGame } from '../external/bserClient.js'
import type { CollectorConfig } from './config.js'
import { qualifiesForDeepVerification } from './identityPriority.js'

export type IdentityVerificationTier = 'quick' | 'normal' | 'deep' | 'skipped'

export interface IdentityVerificationTarget {
  sourceGameId: string
  nickname: string
  teamNumber: number
  characterNum: number
  seasonId: number | null
  matchingMode: number | null
  sourcePlayedAtMs: number | null
}

export interface TieredVerificationResult {
  found: boolean
  totalPages: number
  resolvedTier: IdentityVerificationTier | 'out-of-window'
  stoppedReason: string
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

function matchesTarget(game: BserUserGame, target: IdentityVerificationTarget): boolean {
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

function pageHasSourceGame(games: ReadonlyArray<BserUserGame>, sourceGameId: string): boolean {
  return games.some((game) => String(game.gameId) === sourceGameId)
}

function pageEntirelyPastWindow(
  games: ReadonlyArray<BserUserGame>,
  sourcePlayedAtMs: number | null,
  sourceGameId: string,
): boolean {
  if (sourcePlayedAtMs == null || games.length === 0) return false
  if (pageHasSourceGame(games, sourceGameId)) return false
  const times = games.map(readGameStartMs).filter((value): value is number => value != null)
  if (times.length === 0) return false
  const newestOnPage = Math.max(...times)
  const marginMs = 6 * 60 * 60 * 1000
  return newestOnPage < sourcePlayedAtMs - marginMs
}

export async function verifyIdentityWithTieredPages(
  config: CollectorConfig,
  params: {
    priority: number
    target: IdentityVerificationTarget
    fetchPage: (cursor?: number) => Promise<{ games: BserUserGame[]; next?: number } | null>
  },
): Promise<TieredVerificationResult> {
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

  while (pagesUsed < maxPages) {
    const cursorKey = cursor == null ? 'start' : String(cursor)
    if (seenCursors.has(cursorKey)) {
      return {
        found: false,
        totalPages: pagesUsed,
        resolvedTier: pagesUsed <= quickLimit ? 'quick' : deepAllowed ? 'deep' : 'normal',
        stoppedReason: 'duplicate-page',
      }
    }
    seenCursors.add(cursorKey)

    const page = await params.fetchPage(cursor)
    if (!page) {
      return {
        found: false,
        totalPages: pagesUsed,
        resolvedTier: pagesUsed === 0 ? 'quick' : pagesUsed <= quickLimit ? 'quick' : 'normal',
        stoppedReason: 'budget',
      }
    }
    pagesUsed += 1

    if (page.games.length === 0) {
      stoppedReason = 'empty-page'
      break
    }

    for (const game of page.games) {
      const gameId = String(game.gameId)
      if (seenGameIds.has(gameId)) {
        return {
          found: false,
          totalPages: pagesUsed,
          resolvedTier: pagesUsed <= quickLimit ? 'quick' : deepAllowed ? 'deep' : 'normal',
          stoppedReason: 'duplicate-page',
        }
      }
      seenGameIds.add(gameId)
      if (matchesTarget(game, params.target)) {
        const tier: IdentityVerificationTier =
          pagesUsed <= quickLimit ? 'quick' : deepAllowed && pagesUsed > config.identityNormalPages ? 'deep' : 'normal'
        return { found: true, totalPages: pagesUsed, resolvedTier: tier, stoppedReason: 'found' }
      }
    }

    if (pageEntirelyPastWindow(page.games, params.target.sourcePlayedAtMs, params.target.sourceGameId)) {
      stoppedReason = 'past-window'
      break
    }

    if (!page.next) {
      stoppedReason = 'last-page'
      break
    }
    cursor = page.next
  }

  if (stoppedReason === 'past-window' || (!deepAllowed && pagesUsed >= config.identityNormalPages)) {
    return { found: false, totalPages: pagesUsed, resolvedTier: 'out-of-window', stoppedReason }
  }

  const tier: IdentityVerificationTier =
    pagesUsed <= quickLimit ? 'quick' : deepAllowed ? 'deep' : 'normal'
  return { found: false, totalPages: pagesUsed, resolvedTier: tier, stoppedReason }
}
