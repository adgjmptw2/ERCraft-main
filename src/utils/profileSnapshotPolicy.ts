import { combatRichnessScore } from '@/analysis/profileCharacterStatsPriority'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerSeasonAggregateDTO } from '@/types/player'

import {
  isSeasonAggregateDisplayDowngrade,
  isSeasonAggregateDisplayUpgrade,
} from '@/utils/seasonAggregateDisplay'

function aggregateHasRichData(aggregate: PlayerSeasonAggregateDTO): boolean {
  if (aggregate.rpSeries.length > 0) return true
  const games = aggregate.characterStats.reduce((sum, row) => sum + row.games, 0)
  if (games <= 0) return false
  return aggregate.characterStats.some(
    (row) =>
      (typeof row.kda === 'number' && Number.isFinite(row.kda)) ||
      (typeof row.avgKills === 'number' && Number.isFinite(row.avgKills)) ||
      (typeof row.avgDamage === 'number' && Number.isFinite(row.avgDamage)),
  )
}

/** 캐시 우선 — 명시적 갱신 전 snapshot 고정 */
export function shouldFreezeProfileSnapshot(params: {
  hasRichDisplayedSnapshot: boolean
  isFirstCollect: boolean
  manualRefreshActive: boolean
}): boolean {
  if (params.isFirstCollect) return false
  if (params.manualRefreshActive) return false
  return params.hasRichDisplayedSnapshot
}

export function isRichSeasonAggregate(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
): boolean {
  if (!aggregate) return false
  return aggregateHasRichData(aggregate)
}

/** 명시적 갱신 전 live aggregate 반영 여부 */
export function shouldAllowLiveAggregateUpdate(params: {
  frozen: boolean
  displayed: PlayerSeasonAggregateDTO | null
  incoming: PlayerSeasonAggregateDTO | undefined
}): boolean {
  const { frozen, displayed, incoming } = params
  if (!frozen) return true
  if (!incoming) return false
  if (!displayed) return true
  if (!aggregateHasRichData(displayed)) {
    return (
      isSeasonAggregateDisplayUpgrade(incoming, displayed) ||
      !isSeasonAggregateDisplayDowngrade(incoming, displayed)
    )
  }
  return false
}

/** 명시적 갱신 전 character stats 반영 여부 */
export function shouldAllowLiveCharacterReports(params: {
  frozen: boolean
  displayed: CharacterAnalysisReport[]
  incoming: CharacterAnalysisReport[]
}): boolean {
  if (params.displayed.length === 0) return params.incoming.length > 0
  const displayedScore = combatRichnessScore(params.displayed)
  const incomingScore = combatRichnessScore(params.incoming)
  if (displayedScore > 0 && incomingScore < displayedScore) return false
  if (params.frozen) return incomingScore >= displayedScore
  return true
}
