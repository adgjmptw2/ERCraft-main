// MOCK — 실 API 붙기 전

import matchesData from '@/mocks/matches.json'
import playersData from '@/mocks/players.json'
import type { MatchSummary, Paginated } from '@/types/match'
import type { PlayerStats, PlayerSummary } from '@/types/player'

interface PlayerRecord {
  userNum: number
  nickname: string
  level: number
  tier: string
  mmr: number
  profileImageUrl?: string
}

interface PlayersFile {
  seasonId: number
  players: PlayerRecord[]
}

interface MatchesFile {
  matches: MatchSummary[]
}

const playersFile = playersData as PlayersFile
const matchesFile = matchesData as MatchesFile

function toSummary(p: PlayerRecord): PlayerSummary {
  return {
    userNum: p.userNum,
    nickname: p.nickname,
    level: p.level,
    tier: p.tier,
    profileImageUrl: p.profileImageUrl ?? undefined,
  }
}

function sortedMatchesForUser(userNum: number): MatchSummary[] {
  return matchesFile.matches
    .filter((m) => m.userNum === userNum)
    .sort((a, b) => new Date(b.gameStartedAt).getTime() - new Date(a.gameStartedAt).getTime())
}

export function searchMockPlayersByNickname(query: string): PlayerSummary[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return playersFile.players
    .filter((p) => p.nickname.toLowerCase().includes(q))
    .map(toSummary)
}

export function getMockPlayerByUserNum(userNum: number): PlayerSummary | undefined {
  const p = playersFile.players.find((x) => x.userNum === userNum)
  return p ? toSummary(p) : undefined
}

/** 닉네임 완전 일치, 대소문자만 무시 */
export function getMockPlayerSummaryByNickname(nickname: string): PlayerSummary | undefined {
  const n = nickname.trim().toLowerCase()
  const p = playersFile.players.find((x) => x.nickname.toLowerCase() === n)
  return p ? toSummary(p) : undefined
}

export function buildMockStatsForUser(userNum: number): PlayerStats | null {
  const base = playersFile.players.find((p) => p.userNum === userNum)
  if (!base) return null

  const matches = sortedMatchesForUser(userNum)
  if (matches.length === 0) {
    return {
      userNum,
      seasonId: playersFile.seasonId,
      games: 0,
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      top3: 0,
      mmr: base.mmr,
      winRate: 0,
      avgKills: 0,
      avgPlacement: 0,
      aggregateKda: 0,
    }
  }

  const games = matches.length
  const wins = matches.filter((m) => m.victory).length
  const kills = matches.reduce((s, m) => s + m.kills, 0)
  const deaths = matches.reduce((s, m) => s + m.deaths, 0)
  const assists = matches.reduce((s, m) => s + m.assists, 0)
  const placementSum = matches.reduce((s, m) => s + m.placement, 0)
  const top3count = matches.filter((m) => m.placement <= 3).length

  return {
    userNum,
    seasonId: playersFile.seasonId,
    games,
    wins,
    losses: games - wins,
    kills,
    deaths,
    assists,
    top3: top3count,
    mmr: base.mmr,
    winRate: (wins / games) * 100,
    avgKills: kills / games,
    avgPlacement: placementSum / games,
    aggregateKda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
  }
}

export function sliceMockMatchHistory(
  userNum: number,
  page: number,
  pageSize: number,
): Paginated<MatchSummary> {
  const all = sortedMatchesForUser(userNum)
  const start = page * pageSize
  const items = all.slice(start, start + pageSize)
  const hasNext = start + items.length < all.length
  return {
    items,
    page,
    pageSize,
    hasNext,
  }
}
