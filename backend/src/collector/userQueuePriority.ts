import { getRankTierFromRp } from '../utils/rankTier.js'

/** Lower number = higher priority (collector user queue claims asc). */
export function computeUserQueuePriorityFromRp(
  rpAfter: number | null | undefined,
  displaySeasonId = 11,
): number {
  if (rpAfter == null || !Number.isFinite(rpAfter) || rpAfter <= 0) {
    return 55
  }

  const tier = getRankTierFromRp(rpAfter, undefined, displaySeasonId)
  const tierEn = tier.tierNameEn

  if (tierEn === 'Iron') return 5
  if (tierEn === 'Bronze') return 12
  if (tierEn === 'Silver') return 20
  if (tierEn === 'Gold') return 35
  if (tierEn === 'Platinum') return 45
  if (tierEn === 'Diamond') return 50
  return 60
}

/** Iron through Gold RP cap (season 11 division ladder — Gold 1 max). */
export const LOW_TIER_RP_MAX = 3599

export function isLowTierRp(rpAfter: number | null | undefined): boolean {
  return rpAfter != null && Number.isFinite(rpAfter) && rpAfter >= 0 && rpAfter <= LOW_TIER_RP_MAX
}