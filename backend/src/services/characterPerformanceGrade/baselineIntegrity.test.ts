import { describe, expect, it } from 'vitest'

import baselineDoc from '../../data/characterGrade/tier-baselines.v1.json' with { type: 'json' }
import rolesDoc from '../../data/characterGrade/character-weapon-roles.v1.json' with { type: 'json' }

import {
  aggregateWeaponGroupStats,
  directionalDifference,
} from './metrics.js'
import { computeWeaponGroupScore } from './compute.js'
import { lookupBaselineForCombination } from './baselineStore.js'
import { isBaselineSampleSufficient } from './tierKey.js'
import type { MatchGradeInput } from './metrics.js'

const combinations = baselineDoc.combinations as Record<
  string,
  {
    count: number
    winRate: number
    top3Rate: number
    averagePlace: number
  }
>

const roleEntries = rolesDoc.entries as Record<
  string,
  { characterNum: number; weaponTypeId: number; role: string }
>

const PLAYER_TIER = 'meteorite_plus' as const
const OUTCOME_KEYS = ['winRate', 'top3Rate', 'averagePlace'] as const

function parseCombo(key: string): { characterNum: number; weaponTypeId: number } | null {
  const parts = key.split(':')
  if (parts.length !== 3) return null
  const characterNum = Number(parts[1])
  const weaponTypeId = Number(parts[2])
  if (!Number.isFinite(characterNum) || !Number.isFinite(weaponTypeId)) return null
  return { characterNum, weaponTypeId }
}

function buildTierAverageMatches(
  characterNum: number,
  weaponTypeId: number,
): MatchGradeInput[] {
  const baseline = lookupBaselineForCombination(PLAYER_TIER, characterNum, weaponTypeId)
  if (!baseline) return []

  const wins = Math.round(baseline.metrics.winRate * 20)
  const top3 = Math.round(baseline.metrics.top3Rate * 20)
  return Array.from({ length: 20 }, (_, index) => ({
    placement: index < top3 ? 2 : Math.round(baseline.metrics.averagePlace),
    kills: baseline.metrics.averagePlayerKill,
    assists: baseline.metrics.averagePlayerAssistant,
    deaths: baseline.metrics.averageDeaths,
    teamKills: baseline.metrics.averageTeamKill,
    damageToPlayer: baseline.metrics.averageDamageToPlayer,
    visionScore: null,
    visionFromStructured: false,
    animalKills: null,
    animalKillsFromStructured: false,
    roleMetricsVersion: null,
    damageFromPlayer: null,
    damageFromPlayerFromStructured: false,
    shieldDamageOffsetFromPlayer: null,
    shieldFromStructured: false,
    teamRecover: null,
    teamRecoverFromStructured: false,
    victory: index < wins,
    weaponTypeId,
  }))
}

describe('baseline integrity (39.11C)', () => {
  it('113개 역할 매핑과 meteorite_plus tier baseline 존재', () => {
    const roleKeys = Object.keys(roleEntries)
    expect(roleKeys.length).toBe(113)

    let missingTierBaseline = 0
    for (const entry of Object.values(roleEntries)) {
      const row = combinations[`${PLAYER_TIER}:${entry.characterNum}:${entry.weaponTypeId}`]
      if (!row || !isBaselineSampleSufficient(row.count)) {
        missingTierBaseline += 1
      }
    }
    expect(missingTierBaseline).toBe(0)
  })

  it('IN1000 역전 지표와 전체 역전 조합 수 보고', () => {
    let invertedMetricCount = 0
    let fullyInvertedComboCount = 0

    for (const [key, tierRow] of Object.entries(combinations)) {
      if (!key.startsWith(`${PLAYER_TIER}:`)) continue
      const combo = parseCombo(key)
      if (!combo) continue
      const eliteRow = combinations[`in1000:${combo.characterNum}:${combo.weaponTypeId}`]
      if (!eliteRow || !isBaselineSampleSufficient(eliteRow.count)) continue

      let invertedForCombo = 0
      for (const metricKey of OUTCOME_KEYS) {
        const higherBetter = metricKey !== 'averagePlace'
        const tierValue = tierRow[metricKey]
        const eliteValue = eliteRow[metricKey]
        if (
          directionalDifference(eliteValue, tierValue, higherBetter) <= 0
        ) {
          invertedMetricCount += 1
          invertedForCombo += 1
        }
      }
      if (invertedForCombo === OUTCOME_KEYS.length) {
        fullyInvertedComboCount += 1
      }
    }

    expect(invertedMetricCount).toBeGreaterThan(0)
    expect(fullyInvertedComboCount).toBeGreaterThanOrEqual(20)
  })

  it('tier baseline 존재 조합은 elite 역전만으로 outcomeScore 계산 불가가 되지 않음', () => {
    const fixtureCombos = [
      { characterNum: 73, weaponTypeId: 24, role: '서포터' },
      { characterNum: 51, weaponTypeId: 22, role: '서포터' },
      { characterNum: 77, weaponTypeId: 24, role: '스증 딜러' },
      { characterNum: 64, weaponTypeId: 24, role: '스증 브루저' },
    ]

    for (const combo of fixtureCombos) {
      const matches = buildTierAverageMatches(combo.characterNum, combo.weaponTypeId)
      const stats = aggregateWeaponGroupStats(combo.characterNum, combo.weaponTypeId, matches)
      expect(stats).not.toBeNull()
      const scored = computeWeaponGroupScore(stats!, combo.role as never, PLAYER_TIER)
      expect(scored).not.toBeNull()
    }
  })
})
