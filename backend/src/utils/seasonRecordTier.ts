import type { SeasonRecordContract, SeasonRankContract } from '../contracts/season.js'
import { getRankTierFromRp, shouldDisplayLeaderboardRank } from './rankTier.js'
import { resolveSeasonTierLadder } from './seasonRankTierLadder.js'

function formatSeasonTierLabel(rank: SeasonRankContract): string {
  if (rank.tier === '—' || rank.tier === '언랭크') return rank.tier
  if (rank.division) return `${rank.tier} ${rank.division}`
  return rank.tier
}

function storedMasterTierLabel(record: SeasonRecordContract): '이터니티' | '데미갓' | null {
  const candidates = [record.rank.tier, record.tier]
  for (const raw of candidates) {
    const label = raw?.trim() ?? ''
    if (label === '이터니티' || label.startsWith('이터니티')) return '이터니티'
    if (label === '데미갓' || label.startsWith('데미갓')) return '데미갓'
  }
  return null
}

function resolveSeasonTier(record: SeasonRecordContract) {
  const rankPos = record.rank.rank
  if (rankPos != null && rankPos > 0) {
    return getRankTierFromRp(record.rank.rp, rankPos, record.seasonNumber)
  }

  const computed = getRankTierFromRp(record.rank.rp, undefined, record.seasonNumber)
  if (computed.tierId !== 'mithril') return computed

  const storedMaster = storedMasterTierLabel(record)
  if (storedMaster == null) return computed

  const ladder = resolveSeasonTierLadder(record.seasonNumber)
  const leaderboardRank =
    storedMaster === '이터니티'
      ? 1
      : (ladder.leaderboard.demigodRankMin ?? 201)

  return getRankTierFromRp(record.rank.rp, leaderboardRank, record.seasonNumber)
}

/** 캐시 재조회 시 RP·시즌 기준으로 tier 라벨 재계산 */
export function refreshSeasonRecordTier(record: SeasonRecordContract): SeasonRecordContract {
  if (!record.played || record.rank.rp <= 0) return record

  const tier = resolveSeasonTier(record)
  if (tier.tierId === 'unranked') {
    return {
      ...record,
      rank: { tier: '—', rp: record.rank.rp },
      tier: '—',
    }
  }

  const seasonRank: SeasonRankContract = {
    tier: tier.tierNameKo as SeasonRankContract['tier'],
    division: tier.division ?? undefined,
    rp: record.rank.rp,
    rank:
      record.rank.rank != null &&
      record.rank.rank > 0 &&
      shouldDisplayLeaderboardRank(tier, record.rank.rp, record.seasonNumber, record.rank.rank)
        ? record.rank.rank
        : undefined,
  }

  return {
    ...record,
    rank: seasonRank,
    tier: formatSeasonTierLabel(seasonRank),
  }
}

export function refreshSeasonsContractTiers<T extends { seasons: SeasonRecordContract[] }>(
  body: T,
): T {
  return {
    ...body,
    seasons: body.seasons.map(refreshSeasonRecordTier),
  }
}
