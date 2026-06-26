import type { BserUserGame } from './bserClient.js'

export const ROLE_METRICS_VERSION = 1 as const

export interface ParsedRoleMetricsV1 {
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
  version: typeof ROLE_METRICS_VERSION
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readNumericField(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = (value as Record<string, unknown>)[key]
  return isFiniteNumber(raw) ? raw : undefined
}

function parseIntMetric(value: unknown, key: string): number | null {
  const raw = readNumericField(value, key)
  if (raw === undefined || raw < 0) return null
  return Math.round(raw)
}

function parseFloatMetric(value: unknown, key: string): number | null {
  const raw = readNumericField(value, key)
  if (raw === undefined || raw < 0) return null
  return raw
}

export function parseRoleMetricsV1(game: BserUserGame): ParsedRoleMetricsV1 | null {
  const damageFromPlayer = parseIntMetric(game, 'damageFromPlayer')
  const protectAbsorb = parseIntMetric(game, 'protectAbsorb')
  const shieldDamageOffsetFromPlayer = parseIntMetric(game, 'damageOffsetedByShield_Player')
  const teamRecover = parseIntMetric(game, 'teamRecover')
  const ccTimeToPlayer = parseFloatMetric(game, 'ccTimeToPlayer')
  const viewContribution = parseFloatMetric(game, 'viewContribution')
  const monsterKill = parseIntMetric(game, 'monsterKill')

  const hasAny =
    damageFromPlayer !== null ||
    protectAbsorb !== null ||
    shieldDamageOffsetFromPlayer !== null ||
    teamRecover !== null ||
    ccTimeToPlayer !== null ||
    viewContribution !== null ||
    monsterKill !== null

  if (!hasAny) return null

  return {
    damageFromPlayer,
    protectAbsorb,
    shieldDamageOffsetFromPlayer,
    teamRecover,
    ccTimeToPlayer,
    viewContribution,
    monsterKill,
    version: ROLE_METRICS_VERSION,
  }
}

export function roleMetricsToDbFields(
  metrics: ParsedRoleMetricsV1,
  capturedAt: Date = new Date(),
): {
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
  roleMetricsVersion: number
  roleMetricsCapturedAt: Date
} {
  return {
    damageFromPlayer: metrics.damageFromPlayer,
    protectAbsorb: metrics.protectAbsorb,
    shieldDamageOffsetFromPlayer: metrics.shieldDamageOffsetFromPlayer,
    teamRecover: metrics.teamRecover,
    ccTimeToPlayer: metrics.ccTimeToPlayer,
    viewContribution: metrics.viewContribution,
    monsterKill: metrics.monsterKill,
    roleMetricsVersion: metrics.version,
    roleMetricsCapturedAt: capturedAt,
  }
}
