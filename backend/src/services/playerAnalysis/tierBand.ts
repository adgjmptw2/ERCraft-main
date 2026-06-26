import type { RankTier } from '../../utils/rankTier.js'
import { rankTierToGradeBaselineKey } from '../characterPerformanceGrade/tierKey.js'

export type ExclusiveTierBand =
  | 'iron_bronze'
  | 'silver_gold'
  | 'platinum'
  | 'diamond'
  | 'meteorite'
  | 'mithril'
  | 'demigod_eternity'
  | 'unranked'

const EXCLUSIVE_TIER_BANDS = new Set<ExclusiveTierBand>([
  'iron_bronze',
  'silver_gold',
  'platinum',
  'diamond',
  'meteorite',
  'mithril',
  'demigod_eternity',
  'unranked',
])

export function resolveExclusiveTierBandFromTierKey(
  tierKey: string | null | undefined,
): ExclusiveTierBand {
  if (tierKey && EXCLUSIVE_TIER_BANDS.has(tierKey as ExclusiveTierBand)) {
    return tierKey as ExclusiveTierBand
  }
  switch (tierKey) {
    case 'iron':
    case 'bronze':
      return 'iron_bronze'
    case 'silver':
    case 'gold':
      return 'silver_gold'
    case 'platinum':
    case 'platinum_plus':
      return 'platinum'
    case 'diamond_plus':
      return 'diamond'
    case 'meteorite_plus':
      return 'meteorite'
    case 'mithril_plus':
    case 'in1000':
      return 'mithril'
    default:
      return 'unranked'
  }
}

export function resolveExclusiveTierBandFromRankTier(tier: RankTier | null): ExclusiveTierBand {
  if (!tier) return 'unranked'
  return resolveExclusiveTierBandFromTierKey(rankTierToGradeBaselineKey(tier))
}

export const ADJACENT_TIER_BANDS: Record<ExclusiveTierBand, ExclusiveTierBand[]> = {
  iron_bronze: ['iron_bronze', 'silver_gold'],
  silver_gold: ['iron_bronze', 'silver_gold', 'platinum'],
  platinum: ['silver_gold', 'platinum', 'diamond'],
  diamond: ['platinum', 'diamond', 'meteorite'],
  meteorite: ['diamond', 'meteorite', 'mithril'],
  mithril: ['meteorite', 'mithril', 'demigod_eternity'],
  demigod_eternity: ['mithril', 'demigod_eternity'],
  unranked: ['unranked'],
}