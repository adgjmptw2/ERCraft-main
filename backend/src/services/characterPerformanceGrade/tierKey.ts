import type { RankTier } from '../../utils/rankTier.js'
import {
  ELITE_BASELINE_TIER_KEY,
  ELITE_FALLBACK_BASELINE_TIER_KEY,
  GRADE_BASELINE_TIER_KEYS,
  MIN_BASELINE_SAMPLE_GAMES,
  type GradeBaselineTierKey,
} from './config.js'

export function rankTierToGradeBaselineKey(tier: RankTier): GradeBaselineTierKey | null {
  if (tier.tierId === 'unranked' || tier.tierId === 'api-fallback') {
    return null
  }

  switch (tier.tierNameEn.toLowerCase()) {
    case 'iron':
      return 'iron'
    case 'bronze':
      return 'bronze'
    case 'silver':
      return 'silver'
    case 'gold':
      return 'gold'
    case 'platinum':
      return 'platinum'
    case 'diamond':
      return 'diamond_plus'
    case 'meteorite':
      return 'meteorite_plus'
    case 'mithril':
    case 'demigod':
    case 'eternity':
      return 'mithril_plus'
    default:
      return null
  }
}

export function baselineTierFallbackOrder(primary: GradeBaselineTierKey): GradeBaselineTierKey[] {
  const idx = GRADE_BASELINE_TIER_KEYS.indexOf(primary)
  if (idx < 0) return [primary, 'platinum_plus']
  const ordered: GradeBaselineTierKey[] = [primary]
  for (let distance = 1; distance < GRADE_BASELINE_TIER_KEYS.length; distance += 1) {
    const lower = idx - distance
    const higher = idx + distance
    if (lower >= 0 && GRADE_BASELINE_TIER_KEYS[lower] !== ELITE_BASELINE_TIER_KEY) {
      ordered.push(GRADE_BASELINE_TIER_KEYS[lower]!)
    }
    if (higher < GRADE_BASELINE_TIER_KEYS.length) {
      ordered.push(GRADE_BASELINE_TIER_KEYS[higher]!)
    }
  }
  if (!ordered.includes('platinum_plus')) {
    ordered.push('platinum_plus')
  }
  return ordered
}

export function eliteCandidateTierOrder(playerTierKey: GradeBaselineTierKey): GradeBaselineTierKey[] {
  const playerIdx = GRADE_BASELINE_TIER_KEYS.indexOf(playerTierKey)
  if (playerIdx < 0) return []

  const priority: GradeBaselineTierKey[] = [
    ELITE_BASELINE_TIER_KEY,
    ELITE_FALLBACK_BASELINE_TIER_KEY,
    'meteorite_plus',
    'diamond_plus',
    'platinum_plus',
    'platinum',
    'gold',
    'silver',
    'bronze',
    'iron',
  ]

  return priority.filter((tierKey) => {
    const tierIdx = GRADE_BASELINE_TIER_KEYS.indexOf(tierKey)
    return tierIdx > playerIdx
  })
}

export function isBaselineSampleSufficient(count: number | null | undefined): boolean {
  return typeof count === 'number' && Number.isFinite(count) && count >= MIN_BASELINE_SAMPLE_GAMES
}
