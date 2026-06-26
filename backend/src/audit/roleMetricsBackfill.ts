import type { BserUserGame } from '../external/bserClient.js'
import {
  parseRoleMetricsV1,
  roleMetricsToDbFields,
  ROLE_METRICS_VERSION,
} from '../external/roleMetricsMapper.js'

import type { BackfillStrategy } from './roleMetricBalancedBackfill.js'

export interface BackfillCliOptions {
  dryRun: boolean
  maxGames: number
  resume: boolean
  characterNum: number | null
  weaponTypeId: number | null
  strategy: BackfillStrategy
}

export interface BackfillCheckpoint {
  processedGameIds: string[]
  failedGameIds: Array<{ gameId: string; reason: string }>
  updatedAt: string
}

export interface BackfillGamePlan {
  gameId: string
  rowCount: number
}

export interface BackfillParticipantMatch {
  uid: string
  characterNum: number
  weaponTypeId: number | null
}

export function parseBackfillCliArgs(argv: string[]): BackfillCliOptions {
  let dryRun = true
  let maxGames = 100
  let resume = false
  let characterNum: number | null = null
  let weaponTypeId: number | null = null
  let strategy: BackfillStrategy = 'recent'

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--execute') dryRun = false
    else if (arg === '--resume') resume = true
    else if (arg.startsWith('--strategy=')) {
      const value = arg.split('=')[1]
      strategy = value === 'balanced' ? 'balanced' : 'recent'
    }
    else if (arg.startsWith('--max-games=')) {
      maxGames = Math.max(1, Number(arg.split('=')[1]) || 100)
    } else if (arg.startsWith('--character-num=')) {
      characterNum = Number(arg.split('=')[1]) || null
    } else if (arg.startsWith('--weapon-type-id=')) {
      weaponTypeId = Number(arg.split('=')[1]) || null
    }
  }

  return { dryRun, maxGames, resume, characterNum, weaponTypeId, strategy }
}

export function mergeCheckpoint(
  existing: BackfillCheckpoint | null,
  resume: boolean,
): BackfillCheckpoint {
  if (resume && existing) return existing
  return { processedGameIds: [], failedGameIds: [], updatedAt: new Date().toISOString() }
}

export function isGameAlreadyProcessed(
  gameId: string,
  checkpoint: BackfillCheckpoint,
): boolean {
  return checkpoint.processedGameIds.includes(gameId)
}

export function pickParticipantForRow(
  games: ReadonlyArray<BserUserGame>,
  row: BackfillParticipantMatch,
): BserUserGame | null {
  const byUid = games.filter((game) => {
    const gameUid = typeof game.uid === 'string' ? game.uid : null
    return gameUid != null && gameUid === row.uid
  })
  if (byUid.length === 1) return byUid[0] ?? null
  if (byUid.length > 1 && row.weaponTypeId != null) {
    const narrowed = byUid.find(
      (game) => game.characterNum === row.characterNum && game.bestWeapon === row.weaponTypeId,
    )
    if (narrowed) return narrowed
  }

  const candidates = games.filter((game) => {
    const weapon = game.bestWeapon ?? null
    return game.characterNum === row.characterNum && weapon === row.weaponTypeId
  })
  if (candidates.length === 1) return candidates[0] ?? null
  return null
}

export function buildRoleMetricsUpdatePayload(game: BserUserGame): Record<string, unknown> | null {
  const parsed = parseRoleMetricsV1(game)
  if (!parsed) return null
  return roleMetricsToDbFields(parsed)
}

export function aliasGameIdForLog(gameId: string, index: number): string {
  return `GAME_${String(index).padStart(4, '0')}`
}

export const BACKFILL_CHECKPOINT_VERSION = 1
export const BACKFILL_ROLE_METRICS_SKIP_VERSION = ROLE_METRICS_VERSION

export function dedupeGamePlans(plans: BackfillGamePlan[], maxGames: number): BackfillGamePlan[] {
  const seen = new Set<string>()
  const selected: BackfillGamePlan[] = []
  for (const plan of plans) {
    if (seen.has(plan.gameId)) continue
    seen.add(plan.gameId)
    selected.push(plan)
    if (selected.length >= maxGames) break
  }
  return selected
}
