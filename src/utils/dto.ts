import type { MatchSummary, MatchSummaryDTO } from '@/types/match'
import type { NormalizedRankTier, PlayerStats, PlayerStatsDTO } from '@/types/player'
import { isRealMode } from '@/api/erClient'
import { localizeCharacterName } from '@/utils/characterMap'
import { localizeTier, resolveCharacterDisplayName } from '@/utils/gameLabels'
import { isGradeSupportedGameMode, localizeGameMode, resolveGameMode } from '@/utils/gameMode'
import {
  buildMatchRecordDemoStats,
  getTeamLuckIcon,
  getTeamLuckLabel,
} from '@/utils/matchDemoStats'
import { formatMatchRouteLabel } from '@/utils/matchRouteLabel'
import { normalizeRankTier } from '@/utils/rankTierFromRp'
import {
  mapGameToEquipmentPreview,
  type EquipmentSourceGame,
} from '@/utils/equipmentPreviewMapper'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function kdaRatio(kills: number, deaths: number, assists: number): number {
  const d = deaths === 0 ? 1 : deaths
  return (kills + assists) / d
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function demoGameDurationSeconds(matchId: string): number {
  return 1200 + (hashString(matchId) % 1201)
}

export function formatGameDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function tierFromMmr(mmr: number): string {
  return normalizeRankTier({ rp: mmr }).displayLabel
}

function resolveStatsTier(
  tier: string,
  mmr: number,
  options?: { normalizedTier?: NormalizedRankTier; leaderboardRank?: number | null },
): string {
  if (options?.normalizedTier?.displayLabel) {
    return options.normalizedTier.displayLabel
  }
  if (isRealMode() && mmr > 0) {
    return normalizeRankTier({
      rp: mmr,
      apiTierName: tier || null,
      rankingPosition: options?.leaderboardRank,
    }).displayLabel
  }
  const localized = localizeTier(tier)
  if (localized !== '언랭크' || mmr <= 0) return localized
  return tierFromMmr(mmr)
}

function relativeTime(fromIso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(fromIso).getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  if (diffMs < minute) return '방금 전'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}분 전`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}시간 전`
  if (diffMs < week) return `${Math.floor(diffMs / day)}일 전`
  return `${Math.floor(diffMs / week)}주 전`
}

function resolveEquipmentPreview(match: MatchSummary) {
  if (match.equipmentPreview) return match.equipmentPreview
  const source: EquipmentSourceGame = {
    bestWeapon: match.bestWeapon,
    tacticalSkillGroup: match.tacticalSkillGroup,
    traitFirstCore: match.traitFirstCore,
    traitFirstSub: match.traitFirstSub,
    traitSecondSub: match.traitSecondSub,
    equipment: match.equipment,
    equipmentGrade: match.equipmentGrade,
  }
  return mapGameToEquipmentPreview(source)
}

export function toMatchSummaryDTO(
  match: MatchSummary,
  now: Date = new Date(),
  options: { useDemoFallbacks?: boolean } = {},
): MatchSummaryDTO {
  const useDemoFallbacks = options.useDemoFallbacks ?? true
  const kdaNum = round2(kdaRatio(match.kills, match.deaths, match.assists))
  const demo = useDemoFallbacks ? buildMatchRecordDemoStats(match) : null
  const gameDuration =
    match.gameDuration ?? (demo ? demoGameDurationSeconds(match.matchId) : null)
  const gameMode = resolveGameMode(match)
  const matchGrade = isGradeSupportedGameMode(gameMode)
    ? (match.matchGrade ?? demo?.matchGrade ?? null)
    : null
  const equipmentPreview = resolveEquipmentPreview(match)
  const teamKill = isFiniteNumber(match.teamKills) ? match.teamKills : (demo?.teamKill ?? null)
  const playerDamage = isFiniteNumber(match.playerDamage)
    ? match.playerDamage
    : isFiniteNumber(match.damageToPlayers)
      ? match.damageToPlayers
      : (demo?.playerDamage ?? null)
  const rpDeltaValue = isFiniteNumber(match.rpDelta) ? match.rpDelta : (demo?.rpDeltaValue ?? null)
  const characterLevel = isFiniteNumber(match.characterLevel)
    ? match.characterLevel
    : (demo?.characterLevel ?? null)
  const teamLuck = demo?.teamLuck ?? null

  return {
    ...match,
    characterName: resolveCharacterDisplayName(match.characterNum, match.characterName),
    equipmentPreview,
    gameMode,
    gameModeLabel: localizeGameMode(gameMode),
    kdaString: kdaNum.toFixed(2),
    placementLabel: ordinal(match.placement),
    relativeTime: relativeTime(match.gameStartedAt, now),
    gameDuration,
    gameDurationLabel: gameDuration != null ? formatGameDuration(gameDuration) : '-',
    teamKill,
    playerDamage,
    rpDeltaValue,
    matchGrade,
    teamLuck,
    teamLuckLabel: teamLuck ? getTeamLuckLabel(teamLuck) : '-',
    teamLuckIcon: teamLuck ? getTeamLuckIcon(teamLuck) : '',
    routeLabel: formatMatchRouteLabel({
      gameMode,
      routeIdOfStart: match.routeIdOfStart,
      routeSlotId: match.routeSlotId,
      demoRouteId: demo?.demoRouteId,
    }),
    characterLevel,
  }
}

export function toStatsDTO(
  stats: PlayerStats,
  matches: MatchSummary[],
  tier: string,
  options?: { normalizedTier?: NormalizedRankTier; leaderboardRank?: number | null },
): PlayerStatsDTO {
  const games = stats.games
  const winRate = games > 0 ? (stats.wins / games) * 100 : 0
  const avgKills = games > 0 ? stats.kills / games : 0
  const avgPlacement =
    matches.length > 0 ? matches.reduce((s, m) => s + m.placement, 0) / matches.length : 0
  const kda = round2(kdaRatio(stats.kills, stats.deaths, stats.assists))

  const counts = new Map<string, number>()
  for (const m of matches) {
    counts.set(m.characterName, (counts.get(m.characterName) ?? 0) + 1)
  }
  // 동률: 이름 오름차순
  const names = [...counts.keys()].sort()
  let best: { name: string; count: number } = { name: '', count: 0 }
  for (const name of names) {
    const count = counts.get(name) ?? 0
    if (count > best.count) best = { name, count }
  }

  return {
    userNum: stats.userNum,
    seasonId: stats.seasonId,
    games,
    winRate: round2(winRate),
    avgKills: round2(avgKills),
    avgPlacement: round2(avgPlacement),
    kda,
    kdaString: kda.toFixed(2),
    mostPlayedCharacter: { name: localizeCharacterName(best.name), count: best.count },
    tier: resolveStatsTier(tier, stats.mmr, options),
    mmr: stats.mmr,
    characterStats: stats.characterStats,
    playerMatchCharacterStats: stats.playerMatchCharacterStats,
    playerMatchCharacterStatsMeta: stats.playerMatchCharacterStatsMeta,
    overallGradeV2: stats.overallGradeV2,
    teamPerformanceSummary: stats.teamPerformanceSummary,
  }
}
