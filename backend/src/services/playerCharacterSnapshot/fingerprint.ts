import { createHash } from 'node:crypto'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'

export function snapshotId(params: {
  canonicalUid: string
  displaySeasonId: number
  characterNum: number
  benchmarkScope: string
  benchmarkVersion: string
}): string {
  const raw = [
    params.canonicalUid,
    params.displaySeasonId,
    params.characterNum,
    params.benchmarkScope,
    params.benchmarkVersion,
  ].join(':')
  return createHash('sha256').update(raw).digest('hex').slice(0, 64)
}

export function buildSourceFingerprint(gameIds: ReadonlyArray<string>): string {
  const sorted = [...new Set(gameIds)].sort()
  return createHash('sha256').update(sorted.join('|')).digest('hex').slice(0, 64)
}

export function isValidGameId(gameId: string | null | undefined): gameId is string {
  return typeof gameId === 'string' && gameId.trim().length > 0
}

export function playedAtMs(row: Pick<PlayerMatchRow, 'playedAt'>): number {
  const value = row.playedAt
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') return Date.parse(value)
  return 0
}
