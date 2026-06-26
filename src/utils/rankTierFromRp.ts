import type { NormalizedRankTier } from '@/types/player'

import {
  CURRENT_DISPLAY_SEASON,
  resolveSeasonTierLadder,
  type DivisionTierRow,
  type SeasonTierLadder,
} from '@/utils/seasonRankTierLadder'

export type { NormalizedRankTier as RankTierFromRp }

function divisionTier(row: DivisionTierRow): NormalizedRankTier {
  const divisionLabel = row.division != null ? ` ${row.division}` : ''
  return {
    tierId:
      row.division != null
        ? `${row.tierNameKo}-${row.division}`
        : row.tierNameKo,
    tierNameKo: row.tierNameKo,
    tierNameEn: row.tierNameEn,
    division: row.division,
    minRp: row.minRp,
    maxRp: row.maxRp,
    isLeaderboardTier: false,
    displayLabel: `${row.tierNameKo}${divisionLabel}`,
  }
}

function mithrilTier(ladder: SeasonTierLadder): NormalizedRankTier {
  return {
    tierId: 'mithril',
    tierNameKo: '미스릴',
    tierNameEn: 'Mithril',
    division: null,
    minRp: ladder.mithrilMinRp,
    maxRp: null,
    isLeaderboardTier: false,
    displayLabel: '미스릴',
  }
}

function demigodTier(): NormalizedRankTier {
  return {
    tierId: 'demigod',
    tierNameKo: '데미갓',
    tierNameEn: 'Demigod',
    division: null,
    minRp: 0,
    maxRp: null,
    isLeaderboardTier: true,
    displayLabel: '데미갓',
  }
}

function eternityTier(): NormalizedRankTier {
  return {
    tierId: 'eternity',
    tierNameKo: '이터니티',
    tierNameEn: 'Eternity',
    division: null,
    minRp: 0,
    maxRp: null,
    isLeaderboardTier: true,
    displayLabel: '이터니티',
  }
}

function unrankedTier(): NormalizedRankTier {
  return {
    tierId: 'unranked',
    tierNameKo: '언랭크',
    tierNameEn: 'Unranked',
    division: null,
    minRp: 0,
    maxRp: null,
    isLeaderboardTier: false,
    displayLabel: '언랭크',
  }
}

function resolveLeaderboardTier(
  rp: number,
  rankingPosition: number | null | undefined,
  ladder: SeasonTierLadder,
): NormalizedRankTier | null {
  const rank = rankingPosition ?? null
  if (rank === null || rank <= 0) return null

  const rule = ladder.leaderboard
  if (rule.mode === 'mithril_rank') {
    if (rank <= rule.eternityMaxRank) return eternityTier()
    if (rank <= rule.demigodMaxRank) {
      const minRp = rule.demigodMinRp
      if (minRp != null && rp < minRp) return null
      return demigodTier()
    }
    return null
  }

  const minRp = rule.demigodMinRp ?? ladder.mithrilMinRp
  if (rp < minRp) return null
  if (rank <= rule.eternityMaxRank) return eternityTier()
  const rankMin = rule.demigodRankMin ?? 1
  if (rank >= rankMin && rank <= rule.demigodMaxRank) return demigodTier()
  return null
}

/** real mode fallback — backend normalizedTier 우선, 없을 때만 RP 계산 */
export function getRankTierFromRp(
  rp: number,
  rankingPosition?: number | null,
  displaySeason: number = CURRENT_DISPLAY_SEASON,
): NormalizedRankTier {
  if (!Number.isFinite(rp) || rp < 0) {
    return unrankedTier()
  }

  const ladder = resolveSeasonTierLadder(displaySeason)

  if (rp >= ladder.mithrilMinRp) {
    const leaderboardTier = resolveLeaderboardTier(rp, rankingPosition, ladder)
    if (leaderboardTier) return leaderboardTier
    return mithrilTier(ladder)
  }

  const row =
    ladder.divisionTiers.find((entry) => rp >= entry.minRp && rp <= entry.maxRp) ?? null
  if (!row) return unrankedTier()
  return divisionTier(row)
}

/** 프로필에 서버 순위(#)를 붙일지 — 공식 랭크 API 순위가 있을 때 */
export function shouldDisplayLeaderboardRank(
  _tier: Pick<NormalizedRankTier, 'isLeaderboardTier'>,
  rp: number,
  _displaySeason: number = CURRENT_DISPLAY_SEASON,
  leaderboardRank?: number | null,
): boolean {
  return rp > 0 && leaderboardRank != null && leaderboardRank > 0
}

export function normalizeRankTier(params: {
  rp?: number | null
  apiTierName?: string | null
  rankingPosition?: number | null
  displaySeason?: number | null
}): NormalizedRankTier {
  if (params.rp !== null && params.rp !== undefined && Number.isFinite(params.rp) && params.rp > 0) {
    return getRankTierFromRp(
      params.rp,
      params.rankingPosition,
      params.displaySeason ?? CURRENT_DISPLAY_SEASON,
    )
  }
  if (params.apiTierName && params.apiTierName.trim().length > 0) {
    const label = params.apiTierName.trim()
    return {
      tierId: 'api-fallback',
      tierNameKo: label,
      tierNameEn: label,
      division: null,
      minRp: 0,
      maxRp: null,
      isLeaderboardTier: false,
      displayLabel: label,
    }
  }
  return getRankTierFromRp(-1)
}

export const MITHRIL_MIN_RP = resolveSeasonTierLadder(CURRENT_DISPLAY_SEASON).mithrilMinRp
