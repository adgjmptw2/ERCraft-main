import type { MatchSummary } from '@/types/match'

export type GameMode = 'rank' | 'cobalt' | 'union' | 'normal'

export const GAME_MODE_LABEL: Record<GameMode, string> = {
  rank: '랭크',
  cobalt: '코발트',
  union: '유니온',
  normal: '일반',
}

const DEMO_MODES: GameMode[] = ['rank', 'rank', 'cobalt', 'union', 'normal']

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function resolveGameMode(match: MatchSummary): GameMode {
  if (match.gameMode === 'cobalt') return 'cobalt'
  if (match.cobaltInfusions && match.cobaltInfusions.length > 0) {
    return 'cobalt'
  }
  if (match.gameMode) return match.gameMode
  return DEMO_MODES[hashString(match.matchId) % DEMO_MODES.length] ?? 'rank'
}

export function localizeGameMode(mode: GameMode): string {
  return GAME_MODE_LABEL[mode]
}

export function isRankGameMode(mode: GameMode): boolean {
  return mode === 'rank'
}

export function isNormalGameMode(mode: GameMode): boolean {
  return mode === 'normal'
}

export function isUnionGameMode(mode: GameMode): boolean {
  return mode === 'union'
}

export function isCobaltGameMode(mode: GameMode): boolean {
  return mode === 'cobalt'
}

export function isGradeSupportedGameMode(mode: GameMode): boolean {
  return mode === 'rank'
}
