import type { BackfillGamePlan } from './roleMetricsBackfill.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import { getRankTierFromRp } from '../utils/rankTier.js'

export type BackfillStrategy = 'recent' | 'balanced'

export interface PendingGameCandidate {
  gameId: string
  rowCount: number
  comboKeys: string[]
}

export interface ComboPriorityInput {
  comboKey: string
  sampleCount: number
  role: string | null
}

export function comboPriorityWeight(sampleCount: number, role: string | null): number {
  let weight: number
  if (sampleCount >= 300) weight = 1
  else if (sampleCount >= 100) weight = 50
  else if (sampleCount >= 30) weight = 200
  else weight = 1000
  if (role === '탱커' || role === '서포터') weight *= 1.5
  return weight
}

export function scoreBalancedGame(
  candidate: PendingGameCandidate,
  comboCounts: ReadonlyMap<string, number>,
  roleByCombo: ReadonlyMap<string, string | null>,
): number {
  const seen = new Set<string>()
  let score = 0
  for (const comboKey of candidate.comboKeys) {
    if (seen.has(comboKey)) continue
    seen.add(comboKey)
    const count = comboCounts.get(comboKey) ?? 0
    const role = roleByCombo.get(comboKey) ?? null
    score += comboPriorityWeight(count, role)
  }
  return score
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

export function resolveComboKeyFromMatch(
  rpAfter: number | null,
  displaySeasonId: number,
  characterNum: number,
  weaponTypeId: number,
): string {
  return buildComboKey(resolveRankTierKey(rpAfter, displaySeasonId), characterNum, weaponTypeId)
}

export function selectBalancedGamePlans(
  candidates: ReadonlyArray<PendingGameCandidate>,
  comboCounts: ReadonlyMap<string, number>,
  roleByCombo: ReadonlyMap<string, string | null>,
  maxGames: number,
): BackfillGamePlan[] {
  const scored = candidates
    .map((candidate) => ({
      gameId: candidate.gameId,
      rowCount: candidate.rowCount,
      score: scoreBalancedGame(candidate, comboCounts, roleByCombo),
    }))
    .sort((a, b) => b.score - a.score || b.rowCount - a.rowCount)

  const selected: BackfillGamePlan[] = []
  const seen = new Set<string>()
  for (const entry of scored) {
    if (seen.has(entry.gameId)) continue
    if (entry.score <= 1 && selected.length >= maxGames) break
    seen.add(entry.gameId)
    selected.push({ gameId: entry.gameId, rowCount: entry.rowCount })
    if (selected.length >= maxGames) break
  }
  return selected
}

export function buildComboCountMap(inputs: ReadonlyArray<ComboPriorityInput>): Map<string, number> {
  const map = new Map<string, number>()
  for (const input of inputs) {
    map.set(input.comboKey, input.sampleCount)
  }
  return map
}

export function buildRoleByComboMap(
  inputs: ReadonlyArray<ComboPriorityInput>,
): Map<string, string | null> {
  const map = new Map<string, string | null>()
  for (const input of inputs) {
    map.set(input.comboKey, input.role)
  }
  return map
}
