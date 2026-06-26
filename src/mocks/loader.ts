// MOCK — 실 API 붙기 전

import { buildPlayStyleAnalysis } from '@/analysis/playStyleAnalysis'
import type { PlayerPlayStyleAnalysis } from '@/analysis/playStyleTypes'
import { buildRoleSummary, type RoleSummaryResult } from '@/analysis/roleClassifier'
import {
  buildPopulationMetricsFromMatches,
  buildPlayerAnalysisReport,
} from '@/analysis/playerReport'
import { buildCharacterAnalysisReports } from '@/analysis/characterReport'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerAnalysisReport } from '@/analysis/types'
import matchesData from '@/mocks/matches.json'
import playersData from '@/mocks/players.json'
import { DEMO_LATEST_SEASON } from '@/mocks/seasonHistory'
export type { DemoSeasonRecord, DemoSeasonSnapshot } from '@/mocks/seasonHistory'
export {
  DEMO_LATEST_SEASON,
  getDemoPlayerSeasonHistory,
  getDemoSeasonSnapshot,
} from '@/mocks/seasonHistory'
import { MOCK_RANKING_ENTRIES } from '@/mocks/rankings'
import type { MatchSummary, MatchSummaryDTO, Paginated } from '@/types/match'
import type { PlayerStats, PlayerStatsDTO, PlayerSummary } from '@/types/player'
import { resolveCharacterDisplayName } from '@/utils/characterMap'
import { localizeTier } from '@/utils/gameLabels'
import { selectAnalysisMatches, getAnalysisBasisLabel, type AnalysisScope } from '@/utils/analysisAggregation'
import { buildProfileCharacterReports } from '@/utils/characterStatsFromMatches'
import { buildRpTrendPointsFromMatches } from '@/utils/rpTrendPoints'
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
    tier: localizeTier(p.tier),
    profileImageUrl: p.profileImageUrl ?? undefined,
  }
}

function matchSeasonNumber(match: MatchSummary): number {
  return match.seasonNumber ?? DEMO_LATEST_SEASON
}

export function sortedMatchesForUser(userNum: number): MatchSummary[] {
  return matchesFile.matches
    .filter((m) => m.userNum === userNum)
    .sort((a, b) => new Date(b.gameStartedAt).getTime() - new Date(a.gameStartedAt).getTime())
}

function sortedMatchesForUserSeason(userNum: number, seasonNumber: number): MatchSummary[] {
  return sortedMatchesForUser(userNum).filter((m) => matchSeasonNumber(m) === seasonNumber)
}

function sortedAnalysisMatchesForUserSeason(
  userNum: number,
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): MatchSummary[] {
  return selectAnalysisMatches(
    sortedMatchesForUserSeason(userNum, seasonNumber),
    seasonNumber,
    scope,
  )
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

export function sliceMockMatchHistoryForSeason(
  userNum: number,
  seasonNumber: number,
  page: number,
  pageSize: number,
): Paginated<MatchSummary> {
  const all = sortedMatchesForUserSeason(userNum, seasonNumber)
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

export function getDemoPlayerCharacterReports(nickname: string): CharacterAnalysisReport[] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []

  const playerMatches = sortedMatchesForUser(player.userNum)
  return localizeCharacterReports(buildCharacterAnalysisReports(playerMatches))
}

export function getDemoPlayerCharacterReportsForSeason(
  nickname: string,
  seasonNumber: number,
): CharacterAnalysisReport[] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []

  const playerMatches = sortedMatchesForUserSeason(player.userNum, seasonNumber)
  return buildProfileCharacterReports(playerMatches)
}

export function getDemoPlayerAnalysisCharacterReportsForSeason(
  nickname: string,
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): CharacterAnalysisReport[] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []

  const playerMatches = sortedAnalysisMatchesForUserSeason(player.userNum, seasonNumber, scope)
  return localizeCharacterReports(buildCharacterAnalysisReports(playerMatches))
}

function localizeCharacterReports(reports: CharacterAnalysisReport[]): CharacterAnalysisReport[] {
  return reports.map((report) => ({
    ...report,
    characterName: resolveCharacterDisplayName(report.characterNum, report.characterName),
  }))
}

export function getDemoPlayerAnalysisReportForSeason(
  nickname: string,
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): PlayerAnalysisReport | null {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return null

  const populationMetrics = buildPopulationMetricsFromMatches(getAllDemoMatchesForAnalysis())
  const playerMatches = sortedAnalysisMatchesForUserSeason(player.userNum, seasonNumber, scope)

  return buildPlayerAnalysisReport({
    nickname: player.nickname,
    playerMatches,
    populationMetrics,
    baselineLabel: '데모 평균',
  })
}

function buildPopulationMatchSetsForSeason(
  seasonNumber: number,
  scope: AnalysisScope,
): MatchSummary[][] {
  return playersFile.players
    .map((player) => sortedAnalysisMatchesForUserSeason(player.userNum, seasonNumber, scope))
    .filter((matches) => matches.length >= 3)
}

function buildTierPopulationMatchSetsForSeason(
  tier: string,
  seasonNumber: number,
  scope: AnalysisScope,
): MatchSummary[][] {
  const tierHead = tier.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return playersFile.players
    .filter((player) => player.tier.toLowerCase().startsWith(tierHead))
    .map((player) => sortedAnalysisMatchesForUserSeason(player.userNum, seasonNumber, scope))
    .filter((matches) => matches.length >= 3)
}

export function getDemoPlayStylePopulationMatchSets(
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): MatchSummary[][] {
  return buildPopulationMatchSetsForSeason(seasonNumber, scope)
}

export function getDemoPlayStyleTierPopulationMatchSets(
  nickname: string,
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): MatchSummary[][] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []
  return buildTierPopulationMatchSetsForSeason(player.tier, seasonNumber, scope)
}

export function getDemoAnalysisPopulationMatches(): MatchSummary[] {
  return getAllDemoMatchesForAnalysis()
}

export function getDemoPlayStyleAnalysisForSeason(
  nickname: string,
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): PlayerPlayStyleAnalysis | null {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return null

  const playerMatches = sortedAnalysisMatchesForUserSeason(player.userNum, seasonNumber, scope)

  return buildPlayStyleAnalysis({
    playerMatches,
    populationMatchSets: buildPopulationMatchSetsForSeason(seasonNumber, scope),
    tierPopulationMatchSets: buildTierPopulationMatchSetsForSeason(player.tier, seasonNumber, scope),
    basisLabel: getAnalysisBasisLabel(seasonNumber, scope),
  })
}

export function getDemoAnalysisMatchesForSeason(
  nickname: string,
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): MatchSummary[] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []

  return sortedAnalysisMatchesForUserSeason(player.userNum, seasonNumber, scope)
}

export function getDemoPlayerRpTrendForSeason(
  nickname: string,
  seasonNumber: number,
): RpTrendPoint[] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []

  return buildRpTrendPointsFromMatches(
    sortedMatchesForUserSeason(player.userNum, seasonNumber),
    shortDateLabel,
  )
}

export interface DemoRankingPosition {
  position: number
  total: number
}

export interface RpTrendPoint {
  matchId: string
  dateLabel: string
  /** 해당 일자 마무리(마지막 경기) RP */
  rpAfter: number
  rpDelta?: number
  /** 같은 날 최저 RP — 툴팁용 */
  dayMinRp?: number
  /** 같은 날 최고 RP — 툴팁용 */
  dayMaxRp?: number
  gamesPlayed?: number
}

export interface DemoPlayerCompactSummary {
  averageTeamKills: number | null
  winRate: number | null
  averagePlacement: number | null
  averageDamageToPlayers: number | null
  averageVisionScore: number | null
  averageAnimalKills: number | null
  sampleSize: number
}

export interface DemoPlayerTopSummary extends DemoPlayerCompactSummary {
  currentRp: number | null
  tierLabel: string
  rpTrendPoints: RpTrendPoint[]
}

function averageOptional(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((acc, value) => acc + value, 0)
  const avg = sum / values.length
  if (!Number.isFinite(avg)) return null
  return Math.round(avg * 100) / 100
}

function collectOptionalField(
  matches: MatchSummary[],
  pick: (match: MatchSummary) => number | undefined,
): number | null {
  const values = matches
    .map(pick)
    .filter((value): value is number => value != null && Number.isFinite(value))
  return averageOptional(values)
}

export function getDemoPlayerCompactSummary(
  nickname: string,
  seasonNumber: number = DEMO_LATEST_SEASON,
): DemoPlayerCompactSummary | null {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return null

  const matches = sortedMatchesForUserSeason(player.userNum, seasonNumber)
  const wins = matches.filter((m) => m.victory).length
  const winRate =
    matches.length > 0 ? Math.round((wins / matches.length) * 1000) / 10 : null

  return {
    averageTeamKills: collectOptionalField(matches, (m) => m.teamKills ?? undefined),
    winRate,
    averagePlacement: averageOptional(matches.map((m) => m.placement)),
    averageDamageToPlayers: collectOptionalField(matches, (m) => m.damageToPlayers ?? undefined),
    averageVisionScore: collectOptionalField(matches, (m) => m.visionScore ?? undefined),
    averageAnimalKills: collectOptionalField(matches, (m) => m.animalKills ?? undefined),
    sampleSize: matches.length,
  }
}

export function getDemoPlayerTopSummary(
  nickname: string,
  seasonNumber: number = DEMO_LATEST_SEASON,
): DemoPlayerTopSummary | null {
  const compact = getDemoPlayerCompactSummary(nickname, seasonNumber)
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!compact || !player) return null

  const rpTrendPoints = getDemoPlayerRpTrendForSeason(nickname, seasonNumber)
  const stats = buildMockStatsForUser(player.userNum)
  const currentRp = rpTrendPoints.at(-1)?.rpAfter ?? stats?.mmr ?? null

  return {
    ...compact,
    currentRp,
    tierLabel: player.tier,
    rpTrendPoints,
  }
}

export function getDemoPlayerRoleSummary(
  nickname: string,
  seasonNumber: number = DEMO_LATEST_SEASON,
  scope: AnalysisScope = 'recent20',
): RoleSummaryResult | null {
  const matches = getDemoAnalysisMatchesForSeason(nickname, seasonNumber, scope)
  if (matches.length === 0) {
    const player = getMockPlayerSummaryByNickname(nickname)
    if (!player) return null
    return buildRoleSummary([])
  }
  return buildRoleSummary(matches)
}

export type { RoleSummaryResult }

export interface DemoMatchDetail {
  match: MatchSummary
  nickname: string
  kdaString: string
  placementLabel: string
  playedAtLabel: string
  insight: string
}

function shortDateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function longDateLabel(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function placementOrdinal(n: number): string {
  return `${n}위`
}

function buildDemoMatchInsight(match: MatchSummary, kda: number): string {
  if (match.placement === 1) return '우승으로 마무리한 샘플 매치입니다.'
  if (match.placement <= 3) return '상위권으로 마무리한 샘플 매치입니다.'
  if (kda >= 3 && match.placement > 5) {
    return '교전 지표는 좋지만 순위는 아쉬운 샘플 매치입니다.'
  }
  if (match.placement >= 8) return '후반 생존과 순위 관리가 필요했던 샘플 매치입니다.'
  return '중위권에서 마무리한 샘플 매치입니다.'
}

export function getDemoPlayerRankingPosition(nickname: string): DemoRankingPosition | null {
  const n = nickname.trim().toLowerCase()
  const entry = MOCK_RANKING_ENTRIES.find((e) => e.nickname.toLowerCase() === n)
  if (!entry) return null
  return { position: entry.rank, total: MOCK_RANKING_ENTRIES.length }
}

export function getDemoPlayerRpTrend(nickname: string): RpTrendPoint[] {
  const player = getMockPlayerSummaryByNickname(nickname)
  if (!player) return []

  return buildRpTrendPointsFromMatches(sortedMatchesForUser(player.userNum), shortDateLabel)
}

export function getDemoMatchDetail(matchId: string): DemoMatchDetail | null {
  const match = matchesFile.matches.find((m) => m.matchId === matchId)
  if (!match) return null

  const player = getMockPlayerByUserNum(match.userNum)
  if (!player) return null

  const deaths = match.deaths === 0 ? 1 : match.deaths
  const kda = Math.round(((match.kills + match.assists) / deaths) * 100) / 100

  return {
    match,
    nickname: player.nickname,
    kdaString: kda.toFixed(2),
    placementLabel: placementOrdinal(match.placement),
    playedAtLabel: longDateLabel(match.gameStartedAt),
    insight: buildDemoMatchInsight(match, kda),
  }
}
