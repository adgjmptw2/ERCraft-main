/** 시즌별 공식 RP 티어 구간 — 패치노트/보상 공지 기준 */

export interface DivisionTierRow {
  minRp: number
  maxRp: number
  tierNameKo: string
  tierNameEn: string
  division: number | null
}

export interface SeasonLeaderboardRule {
  /** mithril_rank: S10+ 미스릴 순위만으로 데미/이터 판정 */
  mode: 'rp_threshold' | 'mithril_rank'
  demigodMinRp?: number
  demigodRankMin?: number
  demigodMaxRank: number
  eternityMaxRank: number
}

export interface SeasonTierLadder {
  divisionTiers: DivisionTierRow[]
  mithrilMinRp: number
  leaderboard: SeasonLeaderboardRule
}

export const CURRENT_DISPLAY_SEASON = 11

function row(
  minRp: number,
  maxRp: number,
  tierNameKo: string,
  tierNameEn: string,
  division: number | null,
): DivisionTierRow {
  return { minRp, maxRp, tierNameKo, tierNameEn, division }
}

function ironBronzeSilverGoldPlatDiaS5Base(): DivisionTierRow[] {
  return [
    row(0, 149, '아이언', 'Iron', 4),
    row(150, 299, '아이언', 'Iron', 3),
    row(300, 449, '아이언', 'Iron', 2),
    row(450, 599, '아이언', 'Iron', 1),
    row(600, 799, '브론즈', 'Bronze', 4),
    row(800, 999, '브론즈', 'Bronze', 3),
    row(1000, 1199, '브론즈', 'Bronze', 2),
    row(1200, 1399, '브론즈', 'Bronze', 1),
    row(1400, 1649, '실버', 'Silver', 4),
    row(1650, 1899, '실버', 'Silver', 3),
    row(1900, 2149, '실버', 'Silver', 2),
    row(2150, 2399, '실버', 'Silver', 1),
    row(2400, 2699, '골드', 'Gold', 4),
    row(2700, 2999, '골드', 'Gold', 3),
    row(3000, 3299, '골드', 'Gold', 2),
    row(3300, 3599, '골드', 'Gold', 1),
    row(3600, 3949, '플래티넘', 'Platinum', 4),
    row(3950, 4299, '플래티넘', 'Platinum', 3),
    row(4300, 4649, '플래티넘', 'Platinum', 2),
    row(4650, 4999, '플래티넘', 'Platinum', 1),
    row(5000, 5349, '다이아몬드', 'Diamond', 4),
    row(5350, 5699, '다이아몬드', 'Diamond', 3),
    row(5700, 6049, '다이아몬드', 'Diamond', 2),
    row(6050, 6399, '다이아몬드', 'Diamond', 1),
  ]
}

const LADDER_S1_2: SeasonTierLadder = {
  divisionTiers: [
    row(1000, 1249, '브론즈', 'Bronze', 4),
    row(1250, 1499, '브론즈', 'Bronze', 3),
    row(1500, 1749, '브론즈', 'Bronze', 2),
    row(1750, 1999, '브론즈', 'Bronze', 1),
    row(2000, 2249, '실버', 'Silver', 4),
    row(2250, 2499, '실버', 'Silver', 3),
    row(2500, 2749, '실버', 'Silver', 2),
    row(2750, 2999, '실버', 'Silver', 1),
    row(3000, 3249, '골드', 'Gold', 4),
    row(3250, 3499, '골드', 'Gold', 3),
    row(3500, 3749, '골드', 'Gold', 2),
    row(3750, 3999, '골드', 'Gold', 1),
    row(4000, 4249, '플래티넘', 'Platinum', 4),
    row(4250, 4499, '플래티넘', 'Platinum', 3),
    row(4500, 4749, '플래티넘', 'Platinum', 2),
    row(4750, 4999, '플래티넘', 'Platinum', 1),
    row(5000, 5249, '다이아몬드', 'Diamond', 4),
    row(5250, 5499, '다이아몬드', 'Diamond', 3),
    row(5500, 5749, '다이아몬드', 'Diamond', 2),
    row(5750, 5999, '다이아몬드', 'Diamond', 1),
  ],
  mithrilMinRp: 6000,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 6200,
    demigodRankMin: 201,
    demigodMaxRank: 700,
    eternityMaxRank: 200,
  },
}

const LADDER_S3: SeasonTierLadder = {
  divisionTiers: [
    row(800, 999, '브론즈', 'Bronze', 4),
    row(1000, 1199, '브론즈', 'Bronze', 3),
    row(1200, 1399, '브론즈', 'Bronze', 2),
    row(1400, 1599, '브론즈', 'Bronze', 1),
    row(1600, 1849, '실버', 'Silver', 4),
    row(1850, 2099, '실버', 'Silver', 3),
    row(2100, 2349, '실버', 'Silver', 2),
    row(2350, 2599, '실버', 'Silver', 1),
    row(2600, 2849, '골드', 'Gold', 4),
    row(2850, 3099, '골드', 'Gold', 3),
    row(3100, 3349, '골드', 'Gold', 2),
    row(3350, 3599, '골드', 'Gold', 1),
    row(3600, 3899, '플래티넘', 'Platinum', 4),
    row(3900, 4199, '플래티넘', 'Platinum', 3),
    row(4200, 4499, '플래티넘', 'Platinum', 2),
    row(4500, 4799, '플래티넘', 'Platinum', 1),
    row(4800, 5149, '다이아몬드', 'Diamond', 4),
    row(5150, 5499, '다이아몬드', 'Diamond', 3),
    row(5500, 5849, '다이아몬드', 'Diamond', 2),
    row(5850, 6199, '다이아몬드', 'Diamond', 1),
  ],
  mithrilMinRp: 6200,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 6400,
    demigodRankMin: 201,
    demigodMaxRank: 700,
    eternityMaxRank: 200,
  },
}

const LADDER_S4: SeasonTierLadder = {
  divisionTiers: [
    ...LADDER_S3.divisionTiers.slice(0, 8),
    row(2600, 2899, '골드', 'Gold', 4),
    row(2900, 3199, '골드', 'Gold', 3),
    row(3200, 3499, '골드', 'Gold', 2),
    row(3500, 3799, '골드', 'Gold', 1),
    row(3800, 4149, '플래티넘', 'Platinum', 4),
    row(4150, 4499, '플래티넘', 'Platinum', 3),
    row(4500, 4849, '플래티넘', 'Platinum', 2),
    row(4850, 5199, '플래티넘', 'Platinum', 1),
    row(5200, 5599, '다이아몬드', 'Diamond', 4),
    row(5600, 5999, '다이아몬드', 'Diamond', 3),
    row(6000, 6399, '다이아몬드', 'Diamond', 2),
    row(6400, 6799, '다이아몬드', 'Diamond', 1),
  ],
  mithrilMinRp: 6800,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 7000,
    demigodRankMin: 201,
    demigodMaxRank: 700,
    eternityMaxRank: 200,
  },
}

const LADDER_S5: SeasonTierLadder = {
  divisionTiers: [
    ...ironBronzeSilverGoldPlatDiaS5Base(),
    row(6400, 6799, '메테오라이트', 'Meteorite', null),
  ],
  mithrilMinRp: 6800,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 7500,
    demigodRankMin: 201,
    demigodMaxRank: 700,
    eternityMaxRank: 200,
  },
}

const LADDER_S6: SeasonTierLadder = {
  divisionTiers: [
    ...ironBronzeSilverGoldPlatDiaS5Base(),
    row(6400, 6999, '메테오라이트', 'Meteorite', null),
  ],
  mithrilMinRp: 7000,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 7700,
    demigodRankMin: 301,
    demigodMaxRank: 1000,
    eternityMaxRank: 300,
  },
}

const LADDER_S7_8: SeasonTierLadder = {
  divisionTiers: [
    ...ironBronzeSilverGoldPlatDiaS5Base(),
    row(6400, 7099, '메테오라이트', 'Meteorite', null),
  ],
  mithrilMinRp: 7100,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 7800,
    demigodRankMin: 301,
    demigodMaxRank: 1000,
    eternityMaxRank: 300,
  },
}

const LADDER_S9: SeasonTierLadder = {
  divisionTiers: [
    ...ironBronzeSilverGoldPlatDiaS5Base(),
    row(6400, 7199, '메테오라이트', 'Meteorite', null),
  ],
  mithrilMinRp: 7200,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 7900,
    demigodRankMin: 301,
    demigodMaxRank: 1000,
    eternityMaxRank: 300,
  },
}

const LADDER_S10: SeasonTierLadder = {
  divisionTiers: [
    ...ironBronzeSilverGoldPlatDiaS5Base(),
    row(6400, 6649, '메테오라이트', 'Meteorite', 4),
    row(6650, 6899, '메테오라이트', 'Meteorite', 3),
    row(6900, 7149, '메테오라이트', 'Meteorite', 2),
    row(7150, 7399, '메테오라이트', 'Meteorite', 1),
  ],
  mithrilMinRp: 7400,
  leaderboard: {
    mode: 'mithril_rank',
    demigodMaxRank: 1000,
    eternityMaxRank: 300,
  },
}

const LADDER_S11: SeasonTierLadder = {
  divisionTiers: [
    ...ironBronzeSilverGoldPlatDiaS5Base(),
    row(6400, 6699, '메테오라이트', 'Meteorite', 4),
    row(6700, 6999, '메테오라이트', 'Meteorite', 3),
    row(7000, 7299, '메테오라이트', 'Meteorite', 2),
    row(7300, 7599, '메테오라이트', 'Meteorite', 1),
  ],
  mithrilMinRp: 7600,
  leaderboard: {
    mode: 'rp_threshold',
    demigodMinRp: 8300,
    demigodRankMin: 1,
    demigodMaxRank: 1000,
    eternityMaxRank: 300,
  },
}

/** UI 표시 시즌 → 해당 시즌 종료 시점 RP 구간 */
export function resolveSeasonTierLadder(displaySeason: number): SeasonTierLadder {
  if (displaySeason <= 2) return LADDER_S1_2
  if (displaySeason === 3) return LADDER_S3
  if (displaySeason === 4) return LADDER_S4
  if (displaySeason === 5) return LADDER_S5
  if (displaySeason === 6) return LADDER_S6
  if (displaySeason <= 8) return LADDER_S7_8
  if (displaySeason === 9) return LADDER_S9
  if (displaySeason === 10) return LADDER_S10
  return LADDER_S11
}
