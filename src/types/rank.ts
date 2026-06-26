export const DIVISION_RANK_TIERS = [
  '아이언',
  '브론즈',
  '실버',
  '골드',
  '플래티넘',
  '다이아몬드',
  '메테오라이트',
] as const

export const MASTER_RANK_TIERS = ['미스릴', '데미갓', '이터니티'] as const

export const RANK_TIER_ORDER = [...DIVISION_RANK_TIERS, ...MASTER_RANK_TIERS] as const

export type DivisionRankTier = (typeof DIVISION_RANK_TIERS)[number]
export type MasterRankTier = (typeof MASTER_RANK_TIERS)[number]
export type RankTierName = (typeof RANK_TIER_ORDER)[number]

export type RankDivision = 1 | 2 | 3 | 4

export interface SeasonRank {
  tier: RankTierName
  division?: RankDivision
  rp: number
  /** 데미갓: rp >= 8300 && rank 201~700 / 이터니티: rp >= 8300 && rank 1~200 */
  rank?: number
}
