import type { DivisionTierRow, SeasonTierLadder } from './seasonRankTierLadder.js'
import {
  CURRENT_DISPLAY_SEASON,
  resolveSeasonTierLadder,
} from './seasonRankTierLadder.js'

export interface CharacterGradeRankContext {
  mmr: number
  rank?: number | null
  serverRank?: number | null
}

export interface CharacterGradeSquadContext {
  totalGames?: number
  mmr?: number
  rank?: number
}

export interface RankTier {
  tierId: string
  tierNameKo: string
  tierNameEn: string
  division: number | null
  minRp: number
  maxRp: number | null
  isLeaderboardTier: boolean
  displayLabel: string
}

function divisionTierToRankTier(row: DivisionTierRow): RankTier {
  const divisionLabel = row.division != null ? ` ${row.division}` : ''
  return {
    tierId:
      row.division != null
        ? `${row.tierNameEn.toLowerCase()}-${row.division}`
        : row.tierNameEn.toLowerCase(),
    tierNameKo: row.tierNameKo,
    tierNameEn: row.tierNameEn,
    division: row.division,
    minRp: row.minRp,
    maxRp: row.maxRp,
    isLeaderboardTier: false,
    displayLabel: `${row.tierNameKo}${divisionLabel}`,
  }
}

function mithrilTier(ladder: SeasonTierLadder): RankTier {
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

function demigodTier(rp: number): RankTier {
  return {
    tierId: 'demigod',
    tierNameKo: '데미갓',
    tierNameEn: 'Demigod',
    division: null,
    minRp: rp,
    maxRp: null,
    isLeaderboardTier: true,
    displayLabel: '데미갓',
  }
}

function eternityTier(rp: number): RankTier {
  return {
    tierId: 'eternity',
    tierNameKo: '이터니티',
    tierNameEn: 'Eternity',
    division: null,
    minRp: rp,
    maxRp: null,
    isLeaderboardTier: true,
    displayLabel: '이터니티',
  }
}

function unrankedTier(): RankTier {
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

function fallbackFromApiTierName(apiTierName: string): RankTier {
  const label = apiTierName.trim() || '—'
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

function resolveLeaderboardTier(
  rp: number,
  rankingPosition: number | null | undefined,
  ladder: SeasonTierLadder,
): RankTier | null {
  const rank = rankingPosition ?? null
  if (rank === null || rank <= 0) return null

  const rule = ladder.leaderboard
  if (rule.mode === 'mithril_rank') {
    if (rank <= rule.eternityMaxRank) return eternityTier(rp)
    if (rank <= rule.demigodMaxRank) {
      const minRp = rule.demigodMinRp
      if (minRp != null && rp < minRp) return null
      return demigodTier(rp)
    }
    return null
  }

  const minRp = rule.demigodMinRp ?? ladder.mithrilMinRp
  if (rp < minRp) return null
  if (rank <= rule.eternityMaxRank) return eternityTier(rp)
  const rankMin = rule.demigodRankMin ?? 1
  if (rank >= rankMin && rank <= rule.demigodMaxRank) return demigodTier(rp)
  return null
}

/** RP + optional leaderboard rank → 시즌별 공식 구간 RankTier */
export function getRankTierFromRp(
  rp: number,
  rankingPosition?: number | null,
  displaySeason: number = CURRENT_DISPLAY_SEASON,
): RankTier {
  if (!Number.isFinite(rp) || rp <= 0) {
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
  return divisionTierToRankTier(row)
}

export function resolveCharacterGradePlayerTier(params: {
  placedRank: CharacterGradeRankContext | null
  squad: CharacterGradeSquadContext | null
  displaySeason: number
}): RankTier | null {
  const squadGames = params.squad?.totalGames ?? 0
  const placed =
    params.placedRank != null &&
    ((params.placedRank.rank ?? 0) > 0 || (params.placedRank.serverRank ?? 0) > 0)

  let rp: number | null = null
  let rankingPosition: number | null = null

  if (placed && params.placedRank) {
    if (squadGames > 0 && (params.squad?.mmr ?? 0) > 0) {
      rp = params.squad?.mmr ?? null
      rankingPosition = params.placedRank.rank ?? params.squad?.rank ?? null
    } else {
      rp = params.placedRank.mmr ?? params.squad?.mmr ?? null
      rankingPosition = params.placedRank.rank ?? params.squad?.rank ?? null
    }
  } else if (squadGames > 0 && (params.squad?.mmr ?? 0) > 0) {
    rp = params.squad?.mmr ?? null
    rankingPosition = params.squad?.rank ?? null
  } else if (placed && params.placedRank && (params.placedRank.mmr ?? 0) > 0) {
    rp = params.placedRank.mmr
    rankingPosition = params.placedRank.rank ?? null
  }

  if (rp == null || rp <= 0) return null

  return normalizeRankTier({
    rp,
    rankingPosition,
    displaySeason: params.displaySeason,
  })
}

export function normalizeRankTier(params: {
  rp?: number | null
  apiTierName?: string | null
  rankingPosition?: number | null
  displaySeason?: number | null
}): RankTier {
  if (params.rp !== null && params.rp !== undefined && Number.isFinite(params.rp) && params.rp > 0) {
    return getRankTierFromRp(
      params.rp,
      params.rankingPosition,
      params.displaySeason ?? CURRENT_DISPLAY_SEASON,
    )
  }
  if (params.apiTierName && params.apiTierName.trim().length > 0) {
    return fallbackFromApiTierName(params.apiTierName)
  }
  return unrankedTier()
}

/** 프로필에 서버 순위(#)를 붙일지 — 공식 랭크 API 순위가 있을 때 */
export function shouldDisplayLeaderboardRank(
  _tier: Pick<RankTier, 'isLeaderboardTier'>,
  rp: number,
  _displaySeason: number = CURRENT_DISPLAY_SEASON,
  leaderboardRank?: number | null,
): boolean {
  return rp > 0 && leaderboardRank != null && leaderboardRank > 0
}

/** @deprecated — use getRankTierFromRp. English label for legacy callers. */
export function tierFromMmr(mmr: number | null | undefined): string {
  if (mmr === null || mmr === undefined || mmr <= 0) return 'Unranked'
  const tier = getRankTierFromRp(mmr)
  if (tier.tierNameEn === 'Unranked') return 'Unranked'
  if (tier.division != null) {
    const roman = ['IV', 'III', 'II', 'I'] as const
    return `${tier.tierNameEn} ${roman[4 - tier.division]}`
  }
  return tier.tierNameEn
}

export {
  CURRENT_DISPLAY_SEASON,
  resolveSeasonTierLadder,
}
export const MITHRIL_MIN_RP = resolveSeasonTierLadder(CURRENT_DISPLAY_SEASON).mithrilMinRp
export const ETERNITY_MAX_RANK = 300
export const DEMIGOD_MAX_RANK = 1000
