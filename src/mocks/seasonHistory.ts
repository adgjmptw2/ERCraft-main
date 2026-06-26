// MOCK — 실 API 붙기 전

import playersData from '@/mocks/players.json'
import type { RankDivision, RankTierName, SeasonRank } from '@/types/rank'
import { DIVISION_RANK_TIERS } from '@/types/rank'
import { formatTierDetail, seasonRankToSummaryTier } from '@/utils/rankTier'

export interface DemoSeasonRecord {
  seasonNumber: number
  rank: SeasonRank
  /** 뱃지/요약용 — formatTierBadge(rank) */
  tier: string
  wins: number
  losses: number
  avgPlacement: number
  kda: number
  top3Rate: number
  avgSurvivalSeconds: number
  avgDamage: number
  avgHeal: number
  objectiveContribution: number
}

export interface DemoSeasonSnapshot extends DemoSeasonRecord {
  games: number
  winRate: number
  kdaString: string
  avgSurvivalLabel: string
  tierDetail: string
}

interface PlayerRecord {
  userNum: number
  tier: string
}

interface PlayersFile {
  players: PlayerRecord[]
}

const playersFile = playersData as PlayersFile

export const DEMO_LATEST_SEASON = 11

const MINE_USER_NUM = 920517
const ETERNITY_USER_NUM = 847291
const DEMIGOD_USER_NUM = 301882

const MINE_SEASON_RANKS: Partial<Record<number, SeasonRank>> = {
  5: { tier: '실버', division: 4, rp: 320 },
  6: { tier: '실버', division: 2, rp: 580 },
  7: { tier: '브론즈', division: 3, rp: 210 },
  8: { tier: '다이아몬드', division: 2, rp: 1820 },
  9: { tier: '골드', division: 3, rp: 740 },
  10: { tier: '플래티넘', division: 2, rp: 1240 },
  11: { tier: '미스릴', rp: 7650 },
}

const DIVISION_RP_BASE: Record<DivisionRankTier, number> = {
  아이언: 120,
  브론즈: 350,
  실버: 550,
  골드: 850,
  플래티넘: 1150,
  다이아몬드: 1600,
  메테오라이트: 2100,
}

type DivisionRankTier = (typeof DIVISION_RANK_TIERS)[number]

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function startSeasonForUser(userNum: number): number {
  return 3 + (userNum % 4)
}

function mithrilRank(seed: number, band: 'low' | 'mid' | 'high'): SeasonRank {
  const ranges = {
    low: [7400, 7800] as const,
    mid: [7800, 8200] as const,
    high: [8200, 8299] as const,
  }
  const [min, max] = ranges[band]
  const rp = Math.floor(min + pseudoRandom(seed) * (max - min + 1))
  return { tier: '미스릴', rp }
}

function randomDivisionRank(seed: number): SeasonRank {
  const tierIndex = Math.floor(pseudoRandom(seed) * DIVISION_RANK_TIERS.length)
  const tier = DIVISION_RANK_TIERS[tierIndex] ?? '골드'
  const division = (Math.floor(pseudoRandom(seed + 1) * 4) + 1) as RankDivision
  const base = DIVISION_RP_BASE[tier as DivisionRankTier]
  const rp = base + Math.floor(pseudoRandom(seed + 2) * 450)
  return { tier, division, rp }
}

function finalRankForUser(userNum: number): SeasonRank {
  const seed = userNum * 23 + DEMO_LATEST_SEASON
  const roll = pseudoRandom(seed)

  if (roll > 0.82) return mithrilRank(seed + 1, 'high')
  if (roll > 0.65) return mithrilRank(seed + 2, 'mid')
  if (roll > 0.48) return mithrilRank(seed + 3, 'low')
  if (roll > 0.32) {
    return {
      tier: '메테오라이트',
      division: (Math.floor(pseudoRandom(seed + 4) * 4) + 1) as RankDivision,
      rp: DIVISION_RP_BASE['메테오라이트'] + Math.floor(pseudoRandom(seed + 5) * 400),
    }
  }

  return randomDivisionRank(seed + 6)
}

function rankForSeason(userNum: number, seasonNumber: number, isFinal: boolean): SeasonRank {
  const mineOverride = MINE_SEASON_RANKS[seasonNumber]
  if (userNum === MINE_USER_NUM && mineOverride) return mineOverride

  if (isFinal && userNum === ETERNITY_USER_NUM) {
    // rp >= 8300 && rank <= 200
    return { tier: '이터니티', rp: 9340, rank: 34 }
  }

  if (isFinal && userNum === DEMIGOD_USER_NUM) {
    // rp >= 8300 && rank 201~700
    return { tier: '데미갓', rp: 8720, rank: 523 }
  }

  if (isFinal) return finalRankForUser(userNum)

  const seed = userNum * 31 + seasonNumber * 17
  const roll = pseudoRandom(seed + 99)

  if (roll > 0.88 && seasonNumber >= 9) {
    const tier = '메테오라이트' satisfies RankTierName
    return {
      tier,
      division: (Math.floor(pseudoRandom(seed) * 4) + 1) as RankDivision,
      rp: DIVISION_RP_BASE[tier] + Math.floor(pseudoRandom(seed + 3) * 500),
    }
  }

  return randomDivisionRank(seed)
}

function buildSeasonRecord(userNum: number, seasonNumber: number, rank: SeasonRank): DemoSeasonRecord {
  const seed = userNum * 31 + seasonNumber * 17
  const games = 18 + Math.floor(pseudoRandom(seed) * 72)
  const winRate = 0.32 + pseudoRandom(seed + 1) * 0.36
  const wins = Math.max(0, Math.min(games, Math.round(games * winRate)))
  const losses = games - wins
  const avgPlacement = round2(3.5 + pseudoRandom(seed + 2) * 8)
  const kda = round2(1.2 + pseudoRandom(seed + 3) * 3.5)
  const top3Rate = round2(15 + pseudoRandom(seed + 4) * 55)
  const survivalTotalSec = Math.floor((8 + pseudoRandom(seed + 5) * 7) * 60)
  const avgDamage = Math.floor(3000 + pseudoRandom(seed + 6) * 5000)
  const avgHeal = Math.floor(500 + pseudoRandom(seed + 7) * 2500)
  const objectiveContribution = round2(20 + pseudoRandom(seed + 8) * 40)

  return {
    seasonNumber,
    rank,
    tier: seasonRankToSummaryTier(rank),
    wins,
    losses,
    avgPlacement,
    kda,
    top3Rate,
    avgSurvivalSeconds: survivalTotalSec,
    avgDamage,
    avgHeal,
    objectiveContribution,
  }
}

function historyForPlayer(userNum: number): DemoSeasonRecord[] {
  const startSeason = startSeasonForUser(userNum)
  const records: DemoSeasonRecord[] = []

  for (let seasonNumber = startSeason; seasonNumber <= DEMO_LATEST_SEASON; seasonNumber++) {
    const isFinal = seasonNumber === DEMO_LATEST_SEASON
    const rank = rankForSeason(userNum, seasonNumber, isFinal)
    records.push(buildSeasonRecord(userNum, seasonNumber, rank))
  }

  return records
}

const seasonHistoryCache = new Map<number, DemoSeasonRecord[]>()

function getHistory(userNum: number): DemoSeasonRecord[] {
  const cached = seasonHistoryCache.get(userNum)
  if (cached) return cached

  const player = playersFile.players.find((p) => p.userNum === userNum)
  if (!player) return []

  const history = historyForPlayer(userNum)
  seasonHistoryCache.set(userNum, history)
  return history
}

export function getDemoPlayerSeasonHistory(userNum: number): DemoSeasonRecord[] {
  return getHistory(userNum)
}

export function getDemoSeasonSnapshot(
  userNum: number,
  seasonNumber: number,
): DemoSeasonSnapshot | null {
  const record = getHistory(userNum).find((s) => s.seasonNumber === seasonNumber)
  if (!record) return null

  const games = record.wins + record.losses
  const winRate = games > 0 ? round2((record.wins / games) * 100) : 0
  const minutes = Math.floor(record.avgSurvivalSeconds / 60)
  const seconds = record.avgSurvivalSeconds % 60

  return {
    ...record,
    games,
    winRate,
    kdaString: record.kda.toFixed(2),
    avgSurvivalLabel: `${minutes}분 ${seconds}초`,
    tierDetail: formatTierDetail(record.rank),
  }
}
