import type {
  MatchSummaryContract,
  PlayerSeasonAggregateContract,
  RpSeriesPointContract,
  SeasonAggregateCoverageContract,
  SeasonAggregateCacheStatus,
  SeasonAggregateSource,
  SeasonCharacterAggregateContract,
} from '../contracts/player.js'
import type { BserUserStat, BserCharacterStat } from '../external/bserClient.js'
import { uidToUserNum } from '../external/bserMapper.js'

export type SeasonAggregateBuildSource = Exclude<SeasonAggregateSource, 'cache'>

export interface BuildSeasonAggregateInput {
  uid: string
  apiSeasonId: number
  displaySeasonId: number
  stats: BserUserStat[] | null | undefined
  matches: ReadonlyArray<MatchSummaryContract>
  characterNames?: ReadonlyMap<number, string>
  now?: Date
  matchInputSource?: 'playerMatch' | 'matchesCache'
  /** PlayerMatch DB rank count — coverage가 matches 배열보다 작아지지 않도록 */
  rankGameCount?: number | null
}

export interface BuiltSeasonAggregate extends PlayerSeasonAggregateContract {
  source: SeasonAggregateBuildSource
}

const RP_SERIES_RECENT_DAY_LIMIT = 7

interface MatchCharacterBucket {
  characterNum: number
  characterName?: string
  matches: MatchSummaryContract[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function safeKda(kills: number, assists: number, deaths: number): number {
  if (deaths <= 0) return round2(kills + assists)
  return round2((kills + assists) / deaths)
}

function readNumberField(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = (value as Record<string, unknown>)[key]
  return isFiniteNumber(raw) ? raw : null
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null
}

function readFirstNumberField(value: unknown, keys: ReadonlyArray<string>): number | null {
  for (const key of keys) {
    const found = readNumberField(value, key)
    if (found !== null) return found
  }
  return null
}

function readFirstStringField(value: unknown, keys: ReadonlyArray<string>): string | null {
  for (const key of keys) {
    const found = readStringField(value, key)
    if (found !== null) return found
  }
  return null
}

import {
  isUsefulCharacterName,
  resolveCharacterDisplayName,
} from '../utils/characterDisplayName.js'

function buildCharacterNameMap(
  staticNames: ReadonlyMap<number, string> | null | undefined,
  matches: ReadonlyArray<MatchSummaryContract>,
): Map<number, string> {
  const names = new Map<number, string>()
  for (const [characterNum, name] of staticNames ?? []) {
    if (isUsefulCharacterName(characterNum, name)) {
      names.set(characterNum, name)
    }
  }
  for (const match of matches) {
    if (!isFiniteNumber(match.characterNum) || match.characterNum <= 0) continue
    if (names.has(match.characterNum)) continue
    if (isUsefulCharacterName(match.characterNum, match.characterName)) {
      names.set(match.characterNum, match.characterName)
    }
  }
  return names
}

function kstDayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

function kstDateLabel(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function seasonMatches(
  matches: ReadonlyArray<MatchSummaryContract>,
  displaySeasonId: number,
  apiSeasonId: number,
): MatchSummaryContract[] {
  return matches.filter(
    (match) =>
      match.seasonNumber == null ||
      match.seasonNumber === displaySeasonId ||
      match.seasonNumber === apiSeasonId,
  )
}

function dedupeMatches(matches: ReadonlyArray<MatchSummaryContract>): MatchSummaryContract[] {
  const byId = new Map<string, MatchSummaryContract>()
  for (const match of matches) {
    if (!byId.has(match.matchId)) {
      byId.set(match.matchId, match)
    }
  }
  return [...byId.values()]
}

function rankMatches(
  matches: ReadonlyArray<MatchSummaryContract>,
  displaySeasonId: number,
  apiSeasonId: number,
): MatchSummaryContract[] {
  return dedupeMatches(seasonMatches(matches, displaySeasonId, apiSeasonId)).filter(
    (match) => match.gameMode === 'rank',
  )
}

export function countSeasonRankGames(
  matches: ReadonlyArray<MatchSummaryContract>,
  displaySeasonId: number,
  apiSeasonId: number,
): number {
  return rankMatches(matches, displaySeasonId, apiSeasonId).length
}

function aggregateSource(params: {
  officialCharacters: boolean
  matchCharacters: boolean
  rpSeries: boolean
  matchInputSource?: 'playerMatch' | 'matchesCache'
}): SeasonAggregateBuildSource {
  const pureMatchSource: SeasonAggregateBuildSource =
    params.matchInputSource === 'playerMatch' ? 'playerMatch' : 'matchCache'
  if (params.officialCharacters && (params.matchCharacters || params.rpSeries)) return 'mixed'
  if (params.officialCharacters) return 'officialStats'
  return pureMatchSource
}

function aggregateStatus(params: {
  characterStats: SeasonCharacterAggregateContract[]
  rpSeries: RpSeriesPointContract[]
  expectedGames: number | null
  collectedGames: number | null
}): SeasonAggregateCacheStatus {
  if (params.expectedGames !== null && params.expectedGames > 0) {
    if (params.collectedGames === null || params.collectedGames < params.expectedGames) {
      return 'partial'
    }
  }
  const coveredGames = params.characterStats.reduce((sum, row) => sum + row.games, 0)
  if (params.expectedGames !== null && coveredGames < params.expectedGames) return 'partial'
  if (params.characterStats.length > 0 && params.rpSeries.length >= 2) return 'ready'
  return 'partial'
}

export function resolveSeasonAggregateBasisLabel(params: {
  officialSeasonGames: number | null
  collectedGames: number | null
}): string {
  const { officialSeasonGames, collectedGames } = params
  if (officialSeasonGames !== null && officialSeasonGames > 0) {
    if (collectedGames !== null && collectedGames >= officialSeasonGames) {
      return '시즌 전체 랭크 경기 기준'
    }
    return '시즌 랭크 기록 수집 중'
  }
  return '수집된 랭크 경기 기준'
}

function expectedSeasonGames(stats: ReadonlyArray<BserUserStat> | null | undefined): number | null {
  const squad = stats?.find((row) => row.matchingTeamMode === 3) ?? stats?.[0]
  return isFiniteNumber(squad?.totalGames) && squad.totalGames > 0 ? squad.totalGames : null
}

export function buildSeasonAggregateCoverage(params: {
  stats: ReadonlyArray<BserUserStat> | null | undefined
  matches: ReadonlyArray<MatchSummaryContract> | null | undefined
  displaySeasonId: number
  apiSeasonId: number
  characterCount: number
  rpPointCount: number
}): SeasonAggregateCoverageContract {
  const officialSeasonGames = expectedSeasonGames(params.stats)
  const collectedGames =
    params.matches == null
      ? null
      : rankMatches(params.matches, params.displaySeasonId, params.apiSeasonId).length
  const coverageRatio =
    officialSeasonGames !== null && officialSeasonGames > 0 && collectedGames !== null
      ? round2(Math.min(collectedGames / officialSeasonGames, 1))
      : null

  return {
    officialSeasonGames,
    collectedGames,
    characterCount: params.characterCount,
    rpPointCount: params.rpPointCount,
    coverageRatio,
  }
}

/** DB rank count가 있으면 coverage.collectedGames 하한 — polling 시 matches=[]로 0 표시되는 회귀 방지 */
export function normalizeCoverageCollectedGames(
  coverage: SeasonAggregateCoverageContract,
  rankGameCount: number | null | undefined,
): SeasonAggregateCoverageContract {
  if (rankGameCount == null || rankGameCount <= 0) return coverage

  const collectedFromMatches = coverage.collectedGames ?? 0
  if (rankGameCount <= collectedFromMatches) return coverage

  const { officialSeasonGames } = coverage
  const coverageRatio =
    officialSeasonGames != null && officialSeasonGames > 0
      ? round2(Math.min(rankGameCount / officialSeasonGames, 1))
      : coverage.coverageRatio

  return {
    ...coverage,
    collectedGames: rankGameCount,
    coverageRatio,
  }
}

function officialCharacterToAggregate(
  row: BserCharacterStat,
  season?: BserUserStat,
  characterNames?: ReadonlyMap<number, string>,
): SeasonCharacterAggregateContract {
  const games = row.totalGames
  const wins = row.wins ?? 0
  const winRate = games > 0 ? round2((wins / games) * 100) : 0
  const matchesSeasonTotals = season !== undefined && games > 0 && season.totalGames === games
  const kills =
    readNumberField(row, 'kills') ??
    (matchesSeasonTotals ? Math.round(season.averageKills * games) : 0)
  const assists =
    readNumberField(row, 'assists') ??
    (matchesSeasonTotals ? Math.round(season.averageAssistants * games) : 0)
  const deaths =
    readNumberField(row, 'deaths') ??
    (matchesSeasonTotals ? season.totalDeaths : 0)
  const apiKda = readNumberField(row, 'kda')
  const avgKills =
    readNumberField(row, 'avgKills') ??
    (matchesSeasonTotals ? round2(season.averageKills) : null)
  const avgTeamKills =
    readNumberField(row, 'avgTeamKills') ??
    (matchesSeasonTotals ? round2(season.totalTeamKills / games) : null)
  const avgDamage =
    readFirstNumberField(row, ['avgDamage', 'averageDamage', 'averagePlayerDamage', 'averageDamageToPlayer']) ??
    (matchesSeasonTotals
      ? readFirstNumberField(season, ['avgDamage', 'averageDamage', 'averagePlayerDamage', 'averageDamageToPlayer'])
      : null)
  const gradeLabel = readStringField(row, 'gradeLabel')

  return {
    characterNum: row.characterCode,
    characterName: resolveCharacterDisplayName(
      row.characterCode,
      characterNames?.get(row.characterCode),
    ),
    games,
    wins,
    winRate,
    avgRank: isFiniteNumber(row.averageRank) ? row.averageRank : null,
    kills,
    assists,
    deaths,
    kda: apiKda ?? (kills > 0 || assists > 0 || deaths > 0 ? safeKda(kills, assists, deaths) : null),
    avgTeamKills,
    avgKills,
    avgDamage,
    gradeLabel,
  }
}

export function buildCharacterAggregatesFromStats(
  stats: ReadonlyArray<BserUserStat> | null | undefined,
  characterNames?: ReadonlyMap<number, string>,
): SeasonCharacterAggregateContract[] {
  const squad = stats?.find((row) => row.matchingTeamMode === 3) ?? stats?.[0]
  const rows = squad?.characterStats ?? []

  return rows
    .filter((row) => row.totalGames > 0)
    .map((row) => officialCharacterToAggregate(row, squad, characterNames))
    .sort((a, b) => b.games - a.games)
}

function averageNullable(values: ReadonlyArray<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value))
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function firstGradeLabel(matches: ReadonlyArray<MatchSummaryContract>): string | null {
  for (const match of matches) {
    const label = readFirstStringField(match, ['gradeLabel', 'matchGrade', 'grade', 'rankGrade'])
    if (label !== null) return label
  }
  return null
}

function bucketMatchesByCharacter(matches: ReadonlyArray<MatchSummaryContract>): MatchCharacterBucket[] {
  const buckets = new Map<string, MatchCharacterBucket>()
  for (const match of matches) {
    if (!isFiniteNumber(match.characterNum) || match.characterNum <= 0) continue
    const key = String(match.characterNum)
    const bucket = buckets.get(key) ?? {
      characterNum: match.characterNum,
      characterName: match.characterName,
      matches: [],
    }
    bucket.matches.push(match)
    buckets.set(key, bucket)
  }
  return [...buckets.values()]
}

export function buildCharacterAggregatesFromMatches(
  matches: ReadonlyArray<MatchSummaryContract>,
  displaySeasonId: number,
  apiSeasonId = displaySeasonId,
): SeasonCharacterAggregateContract[] {
  const ranked = rankMatches(matches, displaySeasonId, apiSeasonId)

  return bucketMatchesByCharacter(ranked)
    .map((bucket) => {
      const games = bucket.matches.length
      const wins = bucket.matches.filter((match) => match.victory).length
      const kills = bucket.matches.reduce((sum, match) => sum + match.kills, 0)
      const assists = bucket.matches.reduce((sum, match) => sum + match.assists, 0)
      const deaths = bucket.matches.reduce((sum, match) => sum + match.deaths, 0)
      const avgDamage = averageNullable(
        bucket.matches.map((match) => match.damageToPlayers ?? match.playerDamage ?? null),
      )
      const avgTeamKills = averageNullable(bucket.matches.map((match) => match.teamKills ?? null))
      let totalRpDelta = 0
      let rpDeltaCount = 0
      for (const match of bucket.matches) {
        const delta = resolveMatchRpDelta(match)
        if (delta != null && Number.isFinite(delta)) {
          totalRpDelta += delta
          rpDeltaCount += 1
        }
      }

      return {
        characterNum: bucket.characterNum,
        characterName: resolveCharacterDisplayName(bucket.characterNum, bucket.characterName),
        games,
        wins,
        winRate: games > 0 ? round2((wins / games) * 100) : 0,
        avgRank: averageNullable(bucket.matches.map((match) => match.placement)),
        kills,
        assists,
        deaths,
        kda: safeKda(kills, assists, deaths),
        avgTeamKills: avgTeamKills === null ? null : round2(avgTeamKills),
        avgKills: games > 0 ? round2(kills / games) : null,
        avgDamage: avgDamage === null ? null : round2(avgDamage),
        gradeLabel: firstGradeLabel(bucket.matches),
        totalRpDelta: rpDeltaCount > 0 ? totalRpDelta : null,
      }
    })
    .sort((a, b) => b.games - a.games)
}

function mergeOfficialAndMatchCharacters(
  officialCharacters: ReadonlyArray<SeasonCharacterAggregateContract>,
  matchCharacters: ReadonlyArray<SeasonCharacterAggregateContract>,
): SeasonCharacterAggregateContract[] {
  if (officialCharacters.length === 0) return [...matchCharacters]
  if (matchCharacters.length === 0) return [...officialCharacters]

  const matchByCharacter = new Map(
    matchCharacters.map((row) => [row.characterNum, row] as const),
  )
  const seen = new Set<number>()
  const merged = officialCharacters.map((official) => {
    seen.add(official.characterNum)
    const fromMatches = matchByCharacter.get(official.characterNum)
    if (!fromMatches) return official

    const officialHasDetailedCombat =
      official.kda !== null ||
      official.avgKills !== null ||
      official.avgTeamKills !== null ||
      official.avgDamage !== null ||
      official.gradeLabel !== null

    return {
      ...official,
      characterName: resolveCharacterDisplayName(
        official.characterNum,
        official.characterName ?? fromMatches.characterName,
      ),
      kills: officialHasDetailedCombat ? official.kills : fromMatches.kills,
      assists: officialHasDetailedCombat ? official.assists : fromMatches.assists,
      deaths: officialHasDetailedCombat ? official.deaths : fromMatches.deaths,
      kda: official.kda ?? fromMatches.kda,
      avgTeamKills: official.avgTeamKills ?? fromMatches.avgTeamKills,
      avgKills: official.avgKills ?? fromMatches.avgKills,
      avgDamage: official.avgDamage ?? fromMatches.avgDamage,
      gradeLabel: official.gradeLabel ?? fromMatches.gradeLabel,
    }
  })

  for (const fromMatches of matchCharacters) {
    if (!seen.has(fromMatches.characterNum)) {
      merged.push(fromMatches)
    }
  }

  return merged.sort((a, b) => b.games - a.games)
}

function resolveMatchRpAfter(match: MatchSummaryContract): number | null {
  return readFirstNumberField(match, ['rpAfter', 'mmrAfter', 'rp', 'rankPoint'])
}

function resolveMatchRpDelta(match: MatchSummaryContract): number | null {
  return readFirstNumberField(match, ['rpDelta', 'mmrGain', 'rpGain', 'rankPointGain'])
}

export function buildRpSeriesFromMatches(
  matches: ReadonlyArray<MatchSummaryContract>,
  displaySeasonId: number,
  apiSeasonId = displaySeasonId,
): RpSeriesPointContract[] {
  const rankedWithRp = rankMatches(matches, displaySeasonId, apiSeasonId)
    .map((match) => ({ match, rpAfter: resolveMatchRpAfter(match) }))
    .filter((row): row is { match: MatchSummaryContract; rpAfter: number } =>
      row.rpAfter !== null,
    )
    .sort((a, b) => new Date(a.match.gameStartedAt).getTime() - new Date(b.match.gameStartedAt).getTime())

  const byDay = new Map<string, Array<{ match: MatchSummaryContract; rpAfter: number }>>()
  for (const row of rankedWithRp) {
    const key = kstDayKey(row.match.gameStartedAt)
    const dayMatches = byDay.get(key) ?? []
    dayMatches.push(row)
    byDay.set(key, dayMatches)
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-RP_SERIES_RECENT_DAY_LIMIT)
    .map(([, dayMatches]) => {
      const closing = dayMatches.at(-1)!
      const rpValues = dayMatches.map((row) => row.rpAfter)
      return {
        matchId: closing.match.matchId,
        dateLabel: kstDateLabel(closing.match.gameStartedAt),
        rpAfter: closing.rpAfter,
        rpDelta: resolveMatchRpDelta(closing.match),
        dayMinRp: Math.min(...rpValues),
        dayMaxRp: Math.max(...rpValues),
        gamesPlayed: dayMatches.length,
      }
    })
}

export function buildSeasonAggregate(input: BuildSeasonAggregateInput): BuiltSeasonAggregate {
  const characterNames = buildCharacterNameMap(input.characterNames, input.matches)
  const officialCharacters = buildCharacterAggregatesFromStats(input.stats, characterNames)
  const matchCharacters = buildCharacterAggregatesFromMatches(
    input.matches,
    input.displaySeasonId,
    input.apiSeasonId,
  )
  const rpSeries = buildRpSeriesFromMatches(
    input.matches,
    input.displaySeasonId,
    input.apiSeasonId,
  )
  const useOfficialCharacters = officialCharacters.length > 0
  const characterStats = mergeOfficialAndMatchCharacters(officialCharacters, matchCharacters)
  const source = aggregateSource({
    officialCharacters: useOfficialCharacters,
    matchCharacters: matchCharacters.length > 0,
    rpSeries: rpSeries.length > 0,
    matchInputSource: input.matchInputSource,
  })
  const coverage = normalizeCoverageCollectedGames(
    buildSeasonAggregateCoverage({
      stats: input.stats,
      matches: input.matches,
      displaySeasonId: input.displaySeasonId,
      apiSeasonId: input.apiSeasonId,
      characterCount: characterStats.length,
      rpPointCount: rpSeries.length,
    }),
    input.rankGameCount,
  )
  const cacheStatus = aggregateStatus({
    characterStats,
    rpSeries,
    expectedGames: expectedSeasonGames(input.stats),
    collectedGames: coverage.collectedGames,
  })
  const lastRefreshedAt = (input.now ?? new Date()).toISOString()

  return {
    userNum: uidToUserNum(input.uid),
    seasonId: input.displaySeasonId,
    apiSeasonId: input.apiSeasonId,
    cacheStatus,
    source,
    characterStats,
    rpSeries,
    coverage,
    lastRefreshedAt,
  }
}
