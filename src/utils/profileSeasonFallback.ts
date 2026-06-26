import type { DemoSeasonRecord, DemoSeasonSnapshot } from '@/mocks/seasonHistory'
import type { NormalizedRankTier, PlayerStats, PlayerStatsDTO, PlayerSummary } from '@/types/player'
import type { PlayerSeasonsResponse } from '@/types/season'
import type { RankDivision, SeasonRank } from '@/types/rank'
import { localizeTier } from '@/utils/gameLabels'
import { normalizeRankTier, shouldDisplayLeaderboardRank } from '@/utils/rankTierFromRp'

type StatsFallbackInput = PlayerStats | PlayerStatsDTO

function kdaRatio(kills: number, deaths: number, assists: number): number {
  const d = deaths === 0 ? 1 : deaths
  return Math.round(((kills + assists) / d) * 100) / 100
}

function normalizeStatsInput(stats?: StatsFallbackInput | null): {
  games: number
  wins: number
  losses: number
  kda: number
  mmr: number
  tier?: string
} | null {
  if (!stats) return null
  if ('wins' in stats) {
    return {
      games: stats.games,
      wins: stats.wins,
      losses: stats.losses,
      kda: kdaRatio(stats.kills, stats.deaths, stats.assists),
      mmr: stats.mmr,
    }
  }
  const games = stats.games
  const wins = games > 0 ? Math.round((games * stats.winRate) / 100) : 0
  const losses = Math.max(games - wins, 0)
  return {
    games,
    wins,
    losses,
    kda: stats.kda,
    mmr: stats.mmr,
    tier: stats.tier,
  }
}

function rankFromSummaryTier(tier: string, mmr: number): SeasonRank {
  const localized = localizeTier(tier)
  const parts = localized.split(/\s+/)
  const head = parts[0] ?? localized
  const divisionToken = parts[1]
  const division =
    divisionToken === '1' ? 1 : divisionToken === '2' ? 2 : divisionToken === '3' ? 3 : divisionToken === '4' ? 4 : undefined
  return division ? { tier: head as SeasonRank['tier'], division, rp: mmr } : { tier: head as SeasonRank['tier'], rp: mmr }
}

function normalizedTierToSeasonRank(
  tier: NormalizedRankTier,
  mmr: number,
  leaderboardRank?: number | null,
  seasonNumber: number = 11,
): SeasonRank {
  const showRank =
    leaderboardRank != null &&
    leaderboardRank > 0 &&
    shouldDisplayLeaderboardRank(tier, mmr, seasonNumber, leaderboardRank)
  if (tier.division != null) {
    return {
      tier: tier.tierNameKo as SeasonRank['tier'],
      division: tier.division as RankDivision,
      rp: mmr,
      rank: showRank ? leaderboardRank : undefined,
    }
  }
  return {
    tier: tier.tierNameKo as SeasonRank['tier'],
    rp: mmr,
    rank: showRank ? leaderboardRank : undefined,
  }
}

function seasonRankFromSummary(summary: PlayerSummary, mmr: number, seasonNumber: number): SeasonRank {
  if (summary.normalizedTier) {
    return normalizedTierToSeasonRank(summary.normalizedTier, mmr, summary.leaderboardRank)
  }
  if (mmr > 0) {
    return normalizedTierToSeasonRank(
      normalizeRankTier({
        rp: mmr,
        rankingPosition: summary.leaderboardRank,
        displaySeason: seasonNumber,
      }),
      mmr,
      summary.leaderboardRank,
    )
  }
  return rankFromSummaryTier(summary.tier, mmr)
}

/** seasons API 대기/실패 시 summary·stats로 최소 시즌 스냅샷 */
export function buildFallbackSeasonSnapshot(
  summary: PlayerSummary,
  seasonNumber: number,
  stats?: StatsFallbackInput | null,
): DemoSeasonSnapshot {
  const normalized = normalizeStatsInput(stats)
  const games = normalized?.games ?? 0
  const wins = normalized?.wins ?? 0
  const losses = normalized?.losses ?? Math.max(games - wins, 0)
  const kda = normalized?.kda ?? 0
  const mmr = summary.rp ?? normalized?.mmr ?? 0
  const tierLabel =
    summary.normalizedTier?.displayLabel ??
    (normalized?.tier && normalized.tier !== '언랭크'
      ? normalized.tier
      : localizeTier(summary.tier))

  const rank = seasonRankFromSummary(summary, mmr, seasonNumber)

  return {
    seasonNumber,
    rank,
    tier: tierLabel,
    wins,
    losses,
    avgPlacement: 0,
    kda,
    top3Rate: 0,
    avgSurvivalSeconds: 0,
    avgDamage: 0,
    avgHeal: 0,
    objectiveContribution: 0,
    games: games > 0 ? games : wins + losses,
    winRate: games > 0 ? Math.round((wins / games) * 10000) / 100 : 0,
    kdaString: kda.toFixed(2),
    avgSurvivalLabel: '—',
    tierDetail: tierLabel,
  }
}

/** seasons 캐시가 summary·랭크 API와 어긋난 경우 (구 stats 기반 rank 캐시 등) */
export function shouldRefetchSeasonsDueToRankDrift(
  summary: PlayerSummary,
  seasons: PlayerSeasonsResponse | undefined,
  currentSeason: number,
): boolean {
  if (!seasons || summary.rp == null) return false
  const row = seasons.seasons.find((season) => season.seasonNumber === currentSeason)
  if (!row) return false
  const position = row.rank.rank
  const rp = row.rank.rp
  if (position != null && position > 0 && position <= 1000 && rp < 8300) return true
  return Math.abs(rp - summary.rp) >= 100
}

export function buildFallbackSeasonRecord(
  summary: PlayerSummary,
  seasonNumber: number,
  stats?: StatsFallbackInput | null,
): DemoSeasonRecord {
  const snap = buildFallbackSeasonSnapshot(summary, seasonNumber, stats)
  return {
    seasonNumber: snap.seasonNumber,
    rank: snap.rank,
    tier: snap.tier,
    wins: snap.wins,
    losses: snap.losses,
    avgPlacement: snap.avgPlacement,
    kda: snap.kda,
    top3Rate: snap.top3Rate,
    avgSurvivalSeconds: snap.avgSurvivalSeconds,
    avgDamage: snap.avgDamage,
    avgHeal: snap.avgHeal,
    objectiveContribution: snap.objectiveContribution,
  }
}
