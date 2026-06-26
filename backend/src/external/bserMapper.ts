import type {
  MatchSummaryContract,
  PlayerStatsContract,
  PlayerSummaryContract,
} from '../contracts/player.js'
import type { SeasonRankContract, SeasonRecordContract } from '../contracts/season.js'
import type { BserUser, BserUserGame, BserUserRank, BserUserStat } from './bserClient.js'
import { BSER_TEAM_MODE_SQUAD } from './bserClient.js'
import { mapBserMatchingModeToGameMode, BSER_MATCHING_MODE_COBALT, BSER_MATCHING_MODE_RANKED } from './bserMatchingMode.js'
import { parseRoleMetricsV1 } from './roleMetricsMapper.js'
import type { SeasonCatalog } from './seasonCatalog.js'
import { getRankTierFromRp, normalizeRankTier, shouldDisplayLeaderboardRank } from '../utils/rankTier.js'
import { isKnownCobaltInfusionProductCode } from './cobaltInfusionProductCodes.js'
// BSER 원본 → 프론트 계약(contracts/player.ts) 매핑

/**
 * uid(문자열, 닉변 시 변경됨)를 32bit 양수로 축약.
 * 프론트는 userNum을 키/데모 조회용으로만 쓰므로 세션 내 안정성만 보장하면 됨.
 */
export function uidToUserNum(uid: string): number {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readNumberField(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = (value as Record<string, unknown>)[key]
  return isFiniteNumber(raw) ? raw : undefined
}

function readStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined
}

function readFirstNumberField(value: unknown, keys: ReadonlyArray<string>): number | undefined {
  for (const key of keys) {
    const found = readNumberField(value, key)
    if (found !== undefined) return found
  }
  return undefined
}

function readFirstStringField(value: unknown, keys: ReadonlyArray<string>): string | undefined {
  for (const key of keys) {
    const found = readStringField(value, key)
    if (found !== undefined) return found
  }
  return undefined
}

export function readFinalInfusionArray(value: unknown): number[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = (value as Record<string, unknown>).finalInfusion
  if (!Array.isArray(raw)) return undefined
  const nums = raw.filter((entry): entry is number => isFiniteNumber(entry) && entry > 0)
  return nums.length > 0 ? nums.slice(0, 3) : undefined
}

/** 코발트 장착 인퓨전 — traitSecondSub의 InfusionProduct productCode (792xxxx 등) */
export function isCobaltInfusionProductCode(code: number): boolean {
  return isKnownCobaltInfusionProductCode(code)
}

export function readCobaltInfusionFromTraitSecondSub(
  traitSecondSub: unknown,
): number[] | undefined {
  if (!Array.isArray(traitSecondSub)) return undefined
  const nums = traitSecondSub
    .filter(
      (entry): entry is number =>
        isFiniteNumber(entry) && entry > 0 && isKnownCobaltInfusionProductCode(entry),
    )
    .slice(0, 3)
  return nums.length > 0 ? nums : undefined
}

/**
 * 코발트 인퓨전 표시 코드 — finalInfusion(구매 슬롯 apiCode)보다
 * traitSecondSub(실제 장착 InfusionProduct productCode)를 우선한다.
 */
export function readCobaltInfusionArray(value: unknown): number[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const fromTrait = readCobaltInfusionFromTraitSecondSub(record.traitSecondSub)
  if (fromTrait) return fromTrait
  return readFinalInfusionArray(value)
}

function resolveBserUserGamePresentation(game: BserUserGame): {
  gameMode: NonNullable<MatchSummaryContract['gameMode']>
  cobaltInfusions?: number[]
} {
  const cobaltInfusions = readCobaltInfusionArray(game)

  if (game.matchingMode === BSER_MATCHING_MODE_RANKED) {
    return { gameMode: 'rank' }
  }

  if (game.matchingMode === BSER_MATCHING_MODE_COBALT) {
    return { gameMode: 'cobalt', cobaltInfusions }
  }

  if (cobaltInfusions?.length) {
    return { gameMode: 'cobalt', cobaltInfusions }
  }

  return { gameMode: mapBserMatchingModeToGameMode(game.matchingMode) }
}

/** BSER 랭크 API의 공식 리더보드 순위 (스탯 API squad.rank와 다름) */
export function resolveLeaderboardRank(rank: BserUserRank | null | undefined): number | null {
  if (!rank) return null
  if (rank.rank > 0) return rank.rank
  if (rank.serverRank != null && rank.serverRank > 0) return rank.serverRank
  return null
}

/** BSER MMR(RP) → 한국어 SeasonRank (시즌별 공식 RP 구간) */
export function mmrToSeasonRank(
  mmr: number,
  leaderboardRank?: number | null,
  displaySeason?: number,
): SeasonRankContract {
  const season = displaySeason ?? 11
  const position = leaderboardRank ?? null
  const tier = getRankTierFromRp(mmr, position, season)
  if (tier.tierId === 'unranked') {
    return { tier: '언랭크', rp: 0 }
  }
  const showRank =
    position != null &&
    position > 0 &&
    shouldDisplayLeaderboardRank(tier, mmr, season, position)
  return {
    tier: tier.tierNameKo as SeasonRankContract['tier'],
    division: tier.division ?? undefined,
    rp: mmr,
    rank: showRank ? position : undefined,
  }
}

function pickSquadStat(stats: BserUserStat[]): BserUserStat | null {
  return stats.find((s) => s.matchingTeamMode === BSER_TEAM_MODE_SQUAD) ?? stats[0] ?? null
}

/**
 * 해당 시즌 배치(랭크 게임) 완료 여부.
 * BSER은 배치를 안 본 시즌에도 직전 시즌 MMR을 이월해 돌려주므로 mmr>0만으로 판단하면 안 되고,
 * 리더보드 rank가 0보다 커야 실제로 그 시즌 랭크를 플레이한 것이다.
 */
export function hasPlacement(rank: BserUserRank | null | undefined): boolean {
  return (rank?.rank ?? 0) > 0 || (rank?.serverRank ?? 0) > 0
}

/**
 * 게임·외부 사이트 표시 RP — BSER stats API userStats[].mmr.
 * rank API mmr은 리더보드 순위와 함께 쓰이며 RP 표시값과 다를 수 있다.
 */
export function resolveDisplayedRp(
  rank: BserUserRank | null | undefined,
  stats: BserUserStat[],
): number | null {
  const squad = pickSquadStat(stats)
  const placed = hasPlacement(rank)
  if (!placed) return null
  if (squad && (squad.totalGames ?? 0) > 0 && (squad.mmr ?? 0) > 0) {
    return squad.mmr
  }
  return rank?.mmr ?? squad?.mmr ?? null
}

/** displaySeasonNumber — UI S11 등 표시 시즌. BSER API seasonID와 다를 수 있음 */
export function mapToSeasonRecord(
  displaySeasonNumber: number,
  rank: BserUserRank | null,
  stats: BserUserStat[],
): SeasonRecordContract {
  const squad = pickSquadStat(stats)
  const games = squad?.totalGames ?? 0
  const wins = squad?.totalWins ?? 0
  const losses = Math.max(games - wins, 0)
  const placed = hasPlacement(rank)
  const displayedRp = resolveDisplayedRp(rank, stats)
  const mmr = displayedRp ?? (placed ? (rank?.mmr ?? squad?.mmr ?? 0) : (squad?.mmr ?? 0))
  const played = games > 0 || placed

  const avgKills = squad?.averageKills ?? 0
  const avgAssists = squad?.averageAssistants ?? 0
  const deaths = squad?.totalDeaths ?? 0
  const kills = Math.round(avgKills * games)
  const assists = Math.round(avgAssists * games)
  const kda =
    deaths > 0 ? round2((kills + assists) / deaths) : round2(avgKills + avgAssists)

  const avgPlacement = round2(squad?.averageRank ?? 0)
  const top3Rate = round2((squad?.top3 ?? 0) * 100)
  const winRate = games > 0 ? round2((wins / games) * 100) : 0

  const seasonRank = played
    ? mmrToSeasonRank(mmr, resolveLeaderboardRank(rank), displaySeasonNumber)
    : { tier: '—', rp: 0 }

  return {
    seasonNumber: displaySeasonNumber,
    rank: seasonRank,
    tier: seasonRank.tier === '—' ? '—' : formatSeasonTierLabel(seasonRank),
    wins,
    losses,
    games,
    avgPlacement,
    kda,
    top3Rate,
    winRate,
    played,
  }
}

function formatSeasonTierLabel(rank: SeasonRankContract): string {
  if (rank.tier === '—') return '—'
  if (rank.division) return `${rank.tier} ${rank.division}`
  return rank.tier
}

export function mapToPlayerSummary(
  user: BserUser,
  rank: BserUserRank | null,
  accountLevel?: number,
  stats: BserUserStat[] = [],
): PlayerSummaryContract {
  const placed = hasPlacement(rank)
  const rp = placed ? resolveDisplayedRp(rank, stats) : null
  const normalizedTier = normalizeRankTier({
    rp,
    rankingPosition: resolveLeaderboardRank(rank),
  })
  return {
    userNum: uidToUserNum(user.uid),
    nickname: user.nickname,
    level: accountLevel ?? null,
    tier: placed ? normalizedTier.displayLabel : '언랭크',
    rp,
    leaderboardRank: resolveLeaderboardRank(rank),
    normalizedTier,
  }
}

export function mapToPlayerStats(
  uid: string,
  displaySeasonId: number,
  stat: BserUserStat | null,
): PlayerStatsContract {
  const games = stat?.totalGames ?? 0
  const characterStats = stat?.characterStats?.map((row) => ({
    characterCode: row.characterCode,
    totalGames: row.totalGames,
    maxKillings: row.maxKillings,
    top3: row.top3,
    wins: row.wins,
    averageRank: row.averageRank,
  }))
  return {
    userNum: uidToUserNum(uid),
    seasonId: displaySeasonId,
    games,
    wins: stat?.totalWins ?? 0,
    losses: Math.max(games - (stat?.totalWins ?? 0), 0),
    kills: Math.round((stat?.averageKills ?? 0) * games),
    deaths: stat?.totalDeaths ?? 0,
    assists: Math.round((stat?.averageAssistants ?? 0) * games),
    top3: Math.round((stat?.top3 ?? 0) * games),
    mmr: stat?.mmr ?? 0,
    characterStats,
  }
}

export function mapToMatchSummary(
  uid: string,
  game: BserUserGame,
  characterNames: ReadonlyMap<number, string>,
  catalog?: SeasonCatalog,
): MatchSummaryContract {
  const kills = game.playerKill ?? 0
  const rpAfter = readFirstNumberField(game, ['rpAfter', 'mmrAfter', 'rp', 'rankPoint'])
  const rpDelta = readFirstNumberField(game, ['rpDelta', 'mmrGain', 'rpGain', 'rankPointGain'])
  const damageToPlayer = readFirstNumberField(game, [
    'damageToPlayer',
    'playerDamage',
    'damageToPlayers',
  ])
  const teamKills = readFirstNumberField(game, ['teamKill', 'teamKills'])
  const gradeLabel = readFirstStringField(game, ['gradeLabel', 'matchGrade', 'grade', 'rankGrade'])
  const { gameMode, cobaltInfusions } = resolveBserUserGamePresentation(game)
  const roleMetrics = parseRoleMetricsV1(game)
  return {
    matchId: String(game.gameId),
    userNum: uidToUserNum(uid),
    characterNum: game.characterNum,
    characterName: characterNames.get(game.characterNum) ?? `실험체 #${game.characterNum}`,
    placement: game.gameRank,
    kills,
    deaths: game.playerDeaths ?? (game.victory === 1 ? 0 : 1),
    assists: game.playerAssistant ?? 0,
    gameStartedAt: new Date(game.startDtm).toISOString(),
    victory: game.victory === 1,
    seasonNumber:
      catalog?.displayForApiId(game.seasonId) ??
      (game.seasonId === 0 ? undefined : game.seasonId),
    rpAfter,
    rpDelta,
    gameDuration: game.playTime,
    playerDamage: damageToPlayer,
    credit: game.totalGainVFCredit,
    teamKills,
    damageToPlayers: damageToPlayer,
    visionScore: game.viewContribution,
    animalKills: game.monsterKill,
    gameMode,
    cobaltInfusions,
    accountLevel: game.accountLevel,
    characterLevel: game.characterLevel,
    skinCode: game.skinCode,
    bestWeapon: game.bestWeapon,
    tacticalSkillGroup: game.tacticalSkillGroup,
    traitFirstCore: game.traitFirstCore,
    traitFirstSub: game.traitFirstSub,
    traitSecondSub: game.traitSecondSub,
    equipment: game.equipment,
    equipmentGrade: game.equipmentGrade,
    routeIdOfStart: game.routeIdOfStart,
    routeSlotId: game.routeSlotId,
    gradeLabel,
    matchGrade: gradeLabel,
    roleMetrics: roleMetrics ?? undefined,
  }
}
