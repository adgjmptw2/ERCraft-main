import type { DemoSeasonRecord } from '@/mocks/seasonHistory'
import type { RankDivision, RankTierName, SeasonRank } from '@/types/rank'
import { formatTierDetail } from '@/utils/rankTier'

/** API / mock 공통 시즌 기록 */
export interface PlayerSeasonRecord {
  seasonNumber: number
  rank: SeasonRank
  tier: string
  wins: number
  losses: number
  avgPlacement: number
  kda: number
  top3Rate: number
  avgSurvivalSeconds?: number
  avgDamage?: number
  avgHeal?: number
  objectiveContribution?: number
  played: boolean
}

export interface PlayerSeasonSnapshot extends PlayerSeasonRecord {
  games: number
  winRate: number
  kdaString: string
  avgSurvivalLabel: string
  tierDetail: string
}

export interface PlayerSeasonsResponse {
  currentSeason: number
  seasons: PlayerSeasonRecord[]
  owner?: {
    nickname: string
    userNum: number
  }
  source?: {
    count: number
    strategy: 'canonical' | 'verified-alias'
  }
  requestedRange?: {
    from: number
    to: number
  }
  status?: 'complete' | 'partial'
}

export interface ApiSeasonRank {
  tier: string
  division?: number
  rp: number
  rank?: number
}

export interface ApiSeasonRecord {
  seasonNumber: number
  rank: ApiSeasonRank
  tier: string
  wins: number
  losses: number
  games: number
  avgPlacement: number
  kda: number
  top3Rate: number
  winRate: number
  played: boolean
}

export interface ApiPlayerSeasons {
  currentSeason: number
  seasons: ApiSeasonRecord[]
  owner?: {
    nickname: string
    userNum: number
  }
  source?: {
    count: number
    strategy: 'canonical' | 'verified-alias'
  }
  requestedRange?: {
    from: number
    to: number
  }
  status?: 'complete' | 'partial'
}

function parseSeasonRank(raw: ApiSeasonRank): SeasonRank {
  if (raw.tier === '—') {
    return { tier: '아이언', division: 4, rp: 0 }
  }
  return {
    tier: raw.tier as RankTierName,
    division: raw.division as RankDivision | undefined,
    rp: raw.rp,
    rank: raw.rank,
  }
}

export function mapApiSeasonRecord(raw: ApiSeasonRecord): PlayerSeasonRecord {
  return {
    seasonNumber: raw.seasonNumber,
    rank: parseSeasonRank(raw.rank),
    tier: raw.tier,
    wins: raw.wins,
    losses: raw.losses,
    avgPlacement: raw.avgPlacement,
    kda: raw.kda,
    top3Rate: raw.top3Rate,
    played: raw.played,
  }
}

export function toSeasonSnapshot(record: PlayerSeasonRecord): PlayerSeasonSnapshot | null {
  if (!record.played) return null

  const games = record.wins + record.losses
  const winRate = games > 0 ? Math.round((record.wins / games) * 10000) / 100 : record.wins > 0 ? 100 : 0
  const avgSurvivalSeconds = record.avgSurvivalSeconds ?? 0
  const minutes = Math.floor(avgSurvivalSeconds / 60)
  const seconds = avgSurvivalSeconds % 60

  return {
    ...record,
    games,
    winRate,
    kdaString: record.kda.toFixed(2),
    avgSurvivalLabel:
      avgSurvivalSeconds > 0 ? `${minutes}분 ${seconds}초` : '—',
    tierDetail: formatTierDetail(record.rank),
  }
}

export function mapApiPlayerSeasons(raw: ApiPlayerSeasons): PlayerSeasonsResponse {
  return {
    currentSeason: raw.currentSeason,
    seasons: raw.seasons.map(mapApiSeasonRecord),
    owner: raw.owner,
    requestedRange: raw.requestedRange,
    status: raw.status,
  }
}

export function demoSeasonToPlayerSeason(record: DemoSeasonRecord): PlayerSeasonRecord {
  return {
    seasonNumber: record.seasonNumber,
    rank: record.rank,
    tier: record.tier,
    wins: record.wins,
    losses: record.losses,
    avgPlacement: record.avgPlacement,
    kda: record.kda,
    top3Rate: record.top3Rate,
    avgSurvivalSeconds: record.avgSurvivalSeconds,
    avgDamage: record.avgDamage,
    avgHeal: record.avgHeal,
    objectiveContribution: record.objectiveContribution,
    played: record.wins + record.losses > 0,
  }
}

export function playerSeasonToDemoRecord(record: PlayerSeasonRecord): DemoSeasonRecord {
  return {
    seasonNumber: record.seasonNumber,
    rank: record.rank,
    tier: record.tier,
    wins: record.wins,
    losses: record.losses,
    avgPlacement: record.avgPlacement,
    kda: record.kda,
    top3Rate: record.top3Rate,
    avgSurvivalSeconds: record.avgSurvivalSeconds ?? 0,
    avgDamage: record.avgDamage ?? 0,
    avgHeal: record.avgHeal ?? 0,
    objectiveContribution: record.objectiveContribution ?? 0,
  }
}
