// MOCK — 실 API 붙기 전

import {
  buildPopulationMetricsFromMatches,
  buildPlayerAnalysisReport,
} from '@/analysis/playerReport'
import type { PlayerAnalysisReport } from '@/analysis/types'
import matchesData from '@/mocks/matches.json'
import playersData from '@/mocks/players.json'
import type { MatchSummary, MatchSummaryDTO, Paginated } from '@/types/match'
import type { PlayerStats, PlayerStatsDTO, PlayerSummary } from '@/types/player'
import { toMatchSummaryDTO, toStatsDTO } from '@/utils/dto'

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

export function getSamplePlayerNicknames(): string[] {
  return playersFile.players.map((p) => p.nickname)
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
    }
  }

  const games = matches.length
  const wins = matches.filter((m) => m.victory).length
  const kills = matches.reduce((s, m) => s + m.kills, 0)
  const deaths = matches.reduce((s, m) => s + m.deaths, 0)
  const assists = matches.reduce((s, m) => s + m.assists, 0)
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

export function buildMockStatsDTOForUser(userNum: number): PlayerStatsDTO | null {
  const stats = buildMockStatsForUser(userNum)
  if (!stats) return null
  const player = playersFile.players.find((p) => p.userNum === userNum)
  if (!player) return null
  const matches = sortedMatchesForUser(userNum)
  return toStatsDTO(stats, matches, player.tier)
}

export function sliceMockMatchDTOHistory(
  userNum: number,
  page: number,
  pageSize: number,
): Paginated<MatchSummaryDTO> {
  const result = sliceMockMatchHistory(userNum, page, pageSize)
  return {
    ...result,
    items: result.items.map((m) => toMatchSummaryDTO(m)),
  }
}

export function getAllDemoMatchesForAnalysis(): MatchSummary[] {
  return [...matchesFile.matches]
}

export function getDemoMatchesByPlayerNickname(nickname: string): MatchSummary[] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []
  return sortedMatchesForUser(player.userNum)
}

export function getDemoPlayerAnalysisReport(nickname: string): PlayerAnalysisReport | null {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return null

  const populationMetrics = buildPopulationMetricsFromMatches(getAllDemoMatchesForAnalysis())
  const playerMatches = sortedMatchesForUser(player.userNum)

  return buildPlayerAnalysisReport({
    nickname: player.nickname,
    playerMatches,
    populationMetrics,
    baselineLabel: '데모 평균',
  })
}
