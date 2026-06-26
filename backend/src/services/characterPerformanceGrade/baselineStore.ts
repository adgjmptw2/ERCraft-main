import baselineDoc from '../../data/characterGrade/tier-baselines.v1.json' with { type: 'json' }
import rolesDoc from '../../data/characterGrade/character-weapon-roles.v1.json' with { type: 'json' }

import type { CharacterGradeRole } from './config.js'
import {
  baselineTierFallbackOrder,
  eliteCandidateTierOrder,
  isBaselineSampleSufficient,
} from './tierKey.js'
import type { GradeBaselineTierKey } from './config.js'

export interface BaselineMetrics {
  count: number
  winRate: number
  top3Rate: number
  averagePlace: number
  averagePlayerKill: number
  averagePlayerAssistant: number
  averageTeamKill: number
  averageDeaths: number
  averageDamageToPlayer: number
  averageViewContribution: number
  averageMonsterKill: number
}

export interface BaselineLookupResult {
  tierKey: GradeBaselineTierKey
  metrics: BaselineMetrics
  usedFallback: boolean
}

const combinations = baselineDoc.combinations as Record<string, Partial<BaselineMetrics>>
const roleEntries = rolesDoc.entries as Record<
  string,
  { characterNum: number; weaponTypeId: number; role: CharacterGradeRole }
>

export function getBaselineSnapshotMeta(): {
  collectedAt: string | null
  periodDays: number
} {
  return {
    collectedAt: baselineDoc.collectedAt ?? null,
    periodDays: baselineDoc.periodDays ?? 7,
  }
}

function parseBaselineRow(raw: Partial<BaselineMetrics> | undefined): BaselineMetrics | null {
  if (!raw || typeof raw.count !== 'number' || !Number.isFinite(raw.count)) return null
  const required: Array<keyof BaselineMetrics> = [
    'winRate',
    'top3Rate',
    'averagePlace',
    'averagePlayerKill',
    'averagePlayerAssistant',
    'averageTeamKill',
    'averageDeaths',
    'averageDamageToPlayer',
    'averageViewContribution',
    'averageMonsterKill',
  ]
  for (const key of required) {
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) return null
  }
  return raw as BaselineMetrics
}

function comboKey(tierKey: string, characterNum: number, weaponTypeId: number): string {
  return `${tierKey}:${characterNum}:${weaponTypeId}`
}

function lookupTierRow(
  tierKey: GradeBaselineTierKey,
  characterNum: number,
  weaponTypeId: number,
): BaselineMetrics | null {
  return parseBaselineRow(combinations[comboKey(tierKey, characterNum, weaponTypeId)])
}

export function lookupBaselineMetricsAtTier(
  tierKey: GradeBaselineTierKey,
  characterNum: number,
  weaponTypeId: number,
): BaselineMetrics | null {
  return lookupTierRow(tierKey, characterNum, weaponTypeId)
}

export function lookupEliteCandidatesForMetric(
  playerTierKey: GradeBaselineTierKey,
  characterNum: number,
  weaponTypeId: number,
  readValue: (metrics: BaselineMetrics) => number | null,
): Array<{ tierKey: GradeBaselineTierKey; value: number; count: number }> {
  const candidates: Array<{ tierKey: GradeBaselineTierKey; value: number; count: number }> = []
  for (const tierKey of eliteCandidateTierOrder(playerTierKey)) {
    const row = lookupTierRow(tierKey, characterNum, weaponTypeId)
    if (!row || !isBaselineSampleSufficient(row.count)) continue
    const value = readValue(row)
    if (value == null || !Number.isFinite(value)) continue
    candidates.push({ tierKey, value, count: row.count })
  }
  return candidates
}

export function lookupCharacterWeaponRole(
  characterNum: number,
  weaponTypeId: number,
): CharacterGradeRole | null {
  return roleEntries[`${characterNum}:${weaponTypeId}`]?.role ?? null
}

export function lookupBaselineForCombination(
  playerTierKey: GradeBaselineTierKey,
  characterNum: number,
  weaponTypeId: number,
): BaselineLookupResult | null {
  let tierMetrics: BaselineMetrics | null = null
  let resolvedTierKey: GradeBaselineTierKey = playerTierKey
  let usedFallback = false

  for (const candidate of baselineTierFallbackOrder(playerTierKey)) {
    const row = lookupTierRow(candidate, characterNum, weaponTypeId)
    if (row && isBaselineSampleSufficient(row.count)) {
      tierMetrics = row
      resolvedTierKey = candidate
      usedFallback = candidate !== playerTierKey
      break
    }
  }

  if (!tierMetrics) return null

  return {
    tierKey: resolvedTierKey,
    metrics: tierMetrics,
    usedFallback,
  }
}
