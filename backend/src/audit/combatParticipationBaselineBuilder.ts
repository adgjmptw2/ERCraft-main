import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatComboDisplayName } from '../utils/comboDisplayName.js'
import { CURRENT_DISPLAY_SEASON } from '../utils/seasonRankTierLadder.js'
import { lookupCharacterWeaponRole } from '../services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import { getRankTierFromRp } from '../utils/rankTier.js'
import type { EffectiveReadinessLevel } from './roleMetricCalibration.js'
import { p95WinsorizedMean } from './roleMetricBaselineBuilder.js'
import {
  PARTICIPATION_BASELINE_METRICS,
  resolveParticipationMetricValue,
  type ParticipationMetricKey,
} from '../services/characterPerformanceGrade/combatParticipation.js'

export const COMBAT_PARTICIPATION_BASELINE_VERSION = 1

export interface CombatParticipationBaselineStat {
  totalCount: number
  validCount: number
  nullCount: number
  zeroCount: number
  overOneCount: number
  mean: number | null
  median: number | null
  standardDeviation: number | null
  p10: number | null
  p25: number | null
  p75: number | null
  p90: number | null
  p95: number | null
  p99: number | null
  p95WinsorizedMean: number | null
  readiness: EffectiveReadinessLevel
}

export interface CombatParticipationComboBaseline {
  rankTierKey: string
  characterNum: number
  weaponTypeId: number
  role: string | null
  label: string
  metrics: Record<ParticipationMetricKey, CombatParticipationBaselineStat>
}

export interface CombatParticipationBaselineDocument {
  version: number
  seasonId: number
  generatedAt: string
  participantRowCount: number
  uniqueGameCount: number
  uniqueUserCount: number
  exactCombinationCount: number
  source: 'official-bser-match-rows-aggregated-by-ercraft'
  combinations: Record<string, CombatParticipationComboBaseline>
}

export interface CombatParticipationRow {
  gameId: string
  uid: string
  rankTierKey: string
  characterNum: number
  weaponTypeId: number
  role: string | null
  playedAt: string
  playerKill: number | null
  playerAssistant: number | null
  teamKill: number | null
  damageToPlayer: number | null
  victory: boolean | null
  placement: number | null
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0] ?? null
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? null
  const weight = index - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

function stdDev(values: number[]): number | null {
  if (values.length === 0) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function resolveReadiness(validCount: number): EffectiveReadinessLevel {
  if (validCount < 30) return 'unusable'
  if (validCount < 100) return 'experimental'
  if (validCount < 300) return 'provisional'
  return 'ready'
}

export function computeParticipationBaselineStat(
  values: ReadonlyArray<number | null>,
): CombatParticipationBaselineStat {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value))
  const totalCount = values.length
  const validCount = finite.length
  const nullCount = totalCount - validCount
  const zeroCount = finite.filter((value) => value === 0).length
  const overOneCount = finite.filter((value) => value > 1).length
  const sorted = [...finite].sort((a, b) => a - b)
  const mean = validCount > 0 ? finite.reduce((sum, value) => sum + value, 0) / validCount : null

  return {
    totalCount,
    validCount,
    nullCount,
    zeroCount,
    overOneCount,
    mean,
    median: percentile(sorted, 0.5),
    standardDeviation: stdDev(finite),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    p95WinsorizedMean: p95WinsorizedMean(finite),
    readiness: resolveReadiness(validCount),
  }
}

export function buildComboKey(
  rankTierKey: string,
  characterNum: number,
  weaponTypeId: number,
): string {
  return `${rankTierKey}|${characterNum}:${weaponTypeId}`
}

export function resolveRankTierKey(rpAfter: number | null, displaySeasonId: number): string {
  if (rpAfter == null) return 'unranked'
  const tier = getRankTierFromRp(rpAfter, null, displaySeasonId)
  return rankTierToGradeBaselineKey(tier) ?? 'unranked'
}

export function toCombatParticipationRow(row: {
  gameId: string
  uid: string
  characterNum: number
  bestWeapon: number | null
  rpAfter: number | null
  displaySeasonId: number
  playedAt: Date
  kills: number | null
  assists: number | null
  teamKills: number | null
  damageToPlayer: number | null
  victory: boolean | null
  placement: number | null
}): CombatParticipationRow | null {
  if (row.bestWeapon == null || row.bestWeapon <= 0 || row.characterNum <= 0) return null
  if (row.kills == null || row.assists == null || row.teamKills == null) return null
  const rankTierKey = resolveRankTierKey(row.rpAfter, row.displaySeasonId)
  if (rankTierKey === 'unranked') return null
  return {
    gameId: row.gameId,
    uid: row.uid,
    rankTierKey,
    characterNum: row.characterNum,
    weaponTypeId: row.bestWeapon,
    role: lookupCharacterWeaponRole(row.characterNum, row.bestWeapon),
    playedAt: row.playedAt.toISOString(),
    playerKill: row.kills,
    playerAssistant: row.assists,
    teamKill: row.teamKills,
    damageToPlayer: row.damageToPlayer,
    victory: row.victory,
    placement: row.placement,
  }
}

export function hashUid(uid: string): string {
  return `uid_${createHash('sha256').update(uid).digest('hex').slice(0, 12)}`
}

export function buildCombatParticipationBaselineDocument(
  rows: ReadonlyArray<CombatParticipationRow>,
  seasonId: number = CURRENT_DISPLAY_SEASON,
): CombatParticipationBaselineDocument {
  const comboMap = new Map<string, CombatParticipationRow[]>()
  for (const row of rows) {
    const key = buildComboKey(row.rankTierKey, row.characterNum, row.weaponTypeId)
    const bucket = comboMap.get(key) ?? []
    bucket.push(row)
    comboMap.set(key, bucket)
  }

  const combinations: Record<string, CombatParticipationComboBaseline> = {}
  for (const [comboKey, comboRows] of comboMap) {
    const sample = comboRows[0]!
    const metrics = {} as Record<ParticipationMetricKey, CombatParticipationBaselineStat>
    for (const metric of PARTICIPATION_BASELINE_METRICS) {
      const values = comboRows.map((row) =>
        resolveParticipationMetricValue(metric, {
          playerKill: row.playerKill,
          playerAssistant: row.playerAssistant,
          teamKill: row.teamKill,
        }),
      )
      metrics[metric] = computeParticipationBaselineStat(values)
    }
    combinations[comboKey] = {
      rankTierKey: sample.rankTierKey,
      characterNum: sample.characterNum,
      weaponTypeId: sample.weaponTypeId,
      role: sample.role,
      label: formatComboDisplayName(sample.characterNum, sample.weaponTypeId),
      metrics,
    }
  }

  return {
    version: COMBAT_PARTICIPATION_BASELINE_VERSION,
    seasonId,
    generatedAt: new Date().toISOString(),
    participantRowCount: rows.length,
    uniqueGameCount: new Set(rows.map((row) => row.gameId)).size,
    uniqueUserCount: new Set(rows.map((row) => row.uid)).size,
    exactCombinationCount: Object.keys(combinations).length,
    source: 'official-bser-match-rows-aggregated-by-ercraft',
    combinations,
  }
}

const moduleDir = dirname(fileURLToPath(import.meta.url))

function resolveDefaultBaselinePath(): string {
  const candidates = [
    join(moduleDir, '..', 'data', 'characterGrade', 'combat-participation-baselines.v1.json'),
    join(
      moduleDir,
      '..',
      '..',
      'src',
      'data',
      'characterGrade',
      'combat-participation-baselines.v1.json',
    ),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]!
}

export function loadCombatParticipationBaselineDocument(
  path: string = resolveDefaultBaselinePath(),
): CombatParticipationBaselineDocument {
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as CombatParticipationBaselineDocument
}

export function lookupParticipationComboBaseline(
  document: CombatParticipationBaselineDocument,
  rankTierKey: string,
  characterNum: number,
  weaponTypeId: number,
): CombatParticipationComboBaseline | null {
  return document.combinations[buildComboKey(rankTierKey, characterNum, weaponTypeId)] ?? null
}

export function isParticipationShadowReady(readiness: EffectiveReadinessLevel): boolean {
  return readiness === 'provisional' || readiness === 'ready'
}
