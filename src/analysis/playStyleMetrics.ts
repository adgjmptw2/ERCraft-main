import type { MatchSummary } from '@/types/match'
import { mean } from '@/analysis/percentile'

export interface MatchSetDerivedMetrics {
  avgPlacement: number
  top3Rate: number
  avgDeaths: number
  bottomRate: number
  avgPersonDamage: number | null
  avgKills: number
  tkInvolvementRate: number | null
  avgAssists: number
  creditEfficiency: number | null
  avgSurvivalSeconds: number | null
  avgMonsterDamage: number | null
  avgAnimalKills: number | null
  itemCompletion: number | null
  avgVision: number | null
  winRate: number
  top2Rate: number
  lateTransitionDelta: number | null
  placementStdDev: number
  halfPlacementGap: number
  kdaCoefficientOfVariation: number
}

function average(values: number[]): number | null {
  return mean(values)
}

function stdDev(values: number[]): number | null {
  if (values.length === 0) return null
  const avg = mean(values)
  if (avg == null) return null
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function ratePercent(matches: MatchSummary[], predicate: (match: MatchSummary) => boolean): number {
  if (matches.length === 0) return 0
  return (matches.filter(predicate).length / matches.length) * 100
}

function matchKda(match: MatchSummary): number {
  return (match.kills + match.assists) / Math.max(1, match.deaths)
}

function resolvePersonDamage(match: MatchSummary): number | null {
  if (match.damageToPlayers != null && Number.isFinite(match.damageToPlayers)) {
    return match.damageToPlayers
  }
  if (match.playerDamage != null && Number.isFinite(match.playerDamage)) {
    return match.playerDamage
  }
  return null
}

function resolveTkInvolvement(match: MatchSummary): number | null {
  if (match.teamKills == null || match.teamKills <= 0) return null
  return (match.kills + match.assists) / match.teamKills
}

function resolveCreditEfficiency(match: MatchSummary): number | null {
  if (match.credit == null || match.gameDuration == null || match.gameDuration <= 0) return null
  return match.credit / match.gameDuration
}

function resolveItemCompletion(match: MatchSummary): number | null {
  if (match.credit == null) return null
  return match.credit
}

export function deriveMatchSetMetrics(matches: MatchSummary[]): MatchSetDerivedMetrics | null {
  if (matches.length === 0) return null

  const placements = matches.map((m) => m.placement)
  const deaths = matches.map((m) => m.deaths)
  const kills = matches.map((m) => m.kills)
  const assists = matches.map((m) => m.assists)
  const kdas = matches.map(matchKda)

  const personDamages = matches.map(resolvePersonDamage).filter((v): v is number => v != null)
  const tkRates = matches.map(resolveTkInvolvement).filter((v): v is number => v != null)
  const creditEfficiencies = matches.map(resolveCreditEfficiency).filter((v): v is number => v != null)
  const durations = matches
    .map((m) => m.gameDuration)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const monsterDamages = matches
    .map((m) => m.monsterDamage)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const animalKills = matches
    .map((m) => m.animalKills)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const visions = matches
    .map((m) => m.visionScore)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const itemCompletions = matches.map(resolveItemCompletion).filter((v): v is number => v != null)

  const avgPlacement = average(placements)
  const avgDeaths = average(deaths)
  if (avgPlacement == null || avgDeaths == null) return null

  const placementStd = stdDev(placements)
  const kdaMean = average(kdas)
  const kdaStd = stdDev(kdas)
  if (placementStd == null || kdaMean == null || kdaStd == null) return null

  const mid = Math.ceil(matches.length / 2)
  const recentHalf = matches.slice(0, mid)
  const olderHalf = matches.slice(mid)
  const recentAvg = average(recentHalf.map((m) => m.placement))
  const olderAvg = average(olderHalf.map((m) => m.placement))

  let lateTransitionDelta: number | null = null
  let halfPlacementGap = 0
  if (recentAvg != null && olderAvg != null && olderHalf.length > 0) {
    lateTransitionDelta = olderAvg - recentAvg
    halfPlacementGap = Math.abs(recentAvg - olderAvg)
  }

  return {
    avgPlacement,
    top3Rate: ratePercent(matches, (m) => m.placement <= 3),
    avgDeaths,
    bottomRate: ratePercent(matches, (m) => m.placement >= 7),
    avgPersonDamage: average(personDamages),
    avgKills: average(kills) ?? 0,
    tkInvolvementRate: average(tkRates),
    avgAssists: average(assists) ?? 0,
    creditEfficiency: average(creditEfficiencies),
    avgSurvivalSeconds: average(durations),
    avgMonsterDamage: average(monsterDamages),
    avgAnimalKills: average(animalKills),
    itemCompletion: average(itemCompletions),
    avgVision: average(visions),
    winRate: ratePercent(matches, (m) => m.victory),
    top2Rate: ratePercent(matches, (m) => m.placement <= 2),
    lateTransitionDelta,
    placementStdDev: placementStd,
    halfPlacementGap,
    kdaCoefficientOfVariation: kdaStd / Math.max(1, kdaMean),
  }
}
