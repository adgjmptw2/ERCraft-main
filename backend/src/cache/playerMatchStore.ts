import type { Prisma, PrismaClient } from '@prisma/client'

import type { MatchSummaryContract } from '../contracts/player.js'
import {
  BSER_MATCHING_MODE_COBALT,
  resolveStoredMatchGameMode,
} from '../external/bserMatchingMode.js'
import { readCobaltInfusionArray, readCobaltInfusionFromTraitSecondSub, readFinalInfusionArray, uidToUserNum } from '../external/bserMapper.js'
import { computeMatchPerformanceGrade } from '../services/characterPerformanceGrade/compute.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import {
  isGradeSupportedMode,
  type MatchesQueryMode,
} from '../types/matchesMode.js'
import type { RankTier } from '../utils/rankTier.js'
import {
  deduplicatePlayerMatchRowsByGameId,
  type PlayerMatchRow,
} from '../utils/playerMatchDedup.js'
import {
  filterPlayerMatchRowsByOwner,
  readRawParticipantUid,
} from '../utils/playerMatchOwnership.js'

export interface PlayerMatchStoreContext {
  apiSeasonId: number
  displaySeasonId?: number
  matchingMode?: number | null
  matchingTeamMode?: number | null
  storeRawJson?: boolean
  rawJson?: unknown
}

export interface ReadPlayerMatchesForSeasonParams {
  uid: string
  apiSeasonId: number
  displaySeasonId?: number
  gameMode?: MatchesQueryMode
  limit?: number
  offset?: number
}

export interface CountPlayerMatchesForSeasonParams {
  uid: string
  apiSeasonId: number
  displaySeasonId?: number
  gameMode?: MatchesQueryMode
}

export interface ReadPlayerMatchesForVerifiedSourcesParams {
  uids: string[]
  canonicalUid: string
  apiSeasonId: number
  gameMode?: MatchesQueryMode
}

export interface GetLatestPlayerMatchParams {
  uid: string
  apiSeasonId?: number
  displaySeasonId?: number
  gameMode?: MatchesQueryMode
}

export interface FreshPlayerMatchInput {
  match: MatchSummaryContract
  matchingMode?: number | null
  matchingTeamMode?: number | null
  rawJson?: unknown
}

export interface UpsertFreshPlayerMatchesParams {
  catalog?: SeasonCatalog | null
  seasonBoundary?: { apiSeasonId: number; displaySeasonId: number }
}

export interface UpsertFreshPlayerMatchesResult {
  upserted: number
  skipped: number
  failed: boolean
}

export interface ResolvePlayerMatchContextParams {
  match: MatchSummaryContract
  catalog?: SeasonCatalog | null
  seasonBoundary?: { apiSeasonId: number; displaySeasonId: number }
  matchingMode?: number | null
  matchingTeamMode?: number | null
}

/** season catalog / boundary 기준으로 upsert context를 구성 — 불확실하면 null (skip) */
export function resolvePlayerMatchStoreContext(
  params: ResolvePlayerMatchContextParams,
): PlayerMatchStoreContext | null {
  const { match, catalog, seasonBoundary, matchingMode, matchingTeamMode } = params
  const modeFields = {
    matchingMode: matchingMode ?? null,
    matchingTeamMode: matchingTeamMode ?? null,
  }

  if (seasonBoundary) {
    return {
      apiSeasonId: seasonBoundary.apiSeasonId,
      displaySeasonId: seasonBoundary.displaySeasonId,
      ...modeFields,
    }
  }

  const seasonNumber = match.seasonNumber
  if (seasonNumber == null || !catalog) return null

  const mappedApi = catalog.apiIdForDisplay(seasonNumber)
  if (mappedApi != null && catalog.displayForApiId(mappedApi) === seasonNumber) {
    return {
      apiSeasonId: mappedApi,
      displaySeasonId: seasonNumber,
      ...modeFields,
    }
  }

  const mappedDisplay = catalog.displayForApiId(seasonNumber)
  if (mappedDisplay != null) {
    return {
      apiSeasonId: seasonNumber,
      displaySeasonId: mappedDisplay,
      ...modeFields,
    }
  }

  return null
}

function optionalInt(value: number | undefined): number | null {
  return value === undefined ? null : value
}

function optionalNullableFloat(value: number | null | undefined): number | null {
  return value === undefined || value === null ? null : value
}

function applyRoleMetricsFields(
  input: Prisma.PlayerMatchCreateInput,
  match: MatchSummaryContract,
): void {
  const metrics = match.roleMetrics
  if (!metrics) return

  input.damageFromPlayer = metrics.damageFromPlayer
  input.protectAbsorb = metrics.protectAbsorb
  input.shieldDamageOffsetFromPlayer = metrics.shieldDamageOffsetFromPlayer
  input.teamRecover = metrics.teamRecover
  input.ccTimeToPlayer = optionalNullableFloat(metrics.ccTimeToPlayer)
  input.viewContribution = optionalNullableFloat(metrics.viewContribution)
  input.monsterKill = metrics.monsterKill
  input.roleMetricsVersion = metrics.version
  input.roleMetricsCapturedAt = new Date()
}

function optionalNullableInt(value: number | null | undefined): number | null {
  return value === undefined || value === null ? null : value
}

function isNonEmptyJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0
}

function isNonEmptyJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}

function toStoredJsonArray(value: number[] | undefined): Prisma.InputJsonValue | undefined {
  if (value === undefined || value.length === 0) return undefined
  return value
}

function toStoredJsonEquipment(
  value: number[] | Record<string, number> | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.length > 0 ? value : undefined
  const keys = Object.keys(value)
  return keys.length > 0 ? value : undefined
}

function parseStoredIntArray(value: unknown): number[] | undefined {
  if (!isNonEmptyJsonArray(value)) return undefined
  const nums = value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
  return nums.length > 0 ? nums : undefined
}

function parseStoredEquipment(
  value: unknown,
): number[] | Record<string, number> | undefined {
  if (isNonEmptyJsonArray(value)) {
    const nums = value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    return nums.length > 0 ? nums : undefined
  }
  if (isNonEmptyJsonRecord(value)) {
    const record: Record<string, number> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        record[key] = entry
      }
    }
    return Object.keys(record).length > 0 ? record : undefined
  }
  return undefined
}

/** 전적 카드 loadout 표시에 필요한 상세 필드가 있는지 */
export function matchSummaryHasLoadoutDetail(match: MatchSummaryContract): boolean {
  const equipment = match.equipment
  const hasEquipment =
    equipment !== undefined &&
    (Array.isArray(equipment)
      ? equipment.length > 0
      : Object.keys(equipment).length > 0)

  return (
    match.accountLevel != null ||
    match.characterLevel != null ||
    match.skinCode != null ||
    match.bestWeapon != null ||
    match.tacticalSkillGroup != null ||
    match.traitFirstCore != null ||
    (match.traitFirstSub != null && match.traitFirstSub.length > 0) ||
    (match.traitSecondSub != null && match.traitSecondSub.length > 0) ||
    hasEquipment ||
    match.routeIdOfStart != null
  )
}

export function matchSummaryMissingLoadoutDetail(match: MatchSummaryContract): boolean {
  return !matchSummaryHasLoadoutDetail(match)
}

function buildGameModeFilter(gameMode?: MatchesQueryMode): Prisma.PlayerMatchWhereInput | undefined {
  if (gameMode === undefined || gameMode === 'all') return undefined
  if (gameMode === 'cobalt') {
    return {
      OR: [{ gameMode: 'cobalt' }, { matchingMode: BSER_MATCHING_MODE_COBALT }],
    }
  }
  return { gameMode }
}

function buildSeasonWhere(params: {
  uid: string
  apiSeasonId?: number
  displaySeasonId?: number
  gameMode?: MatchesQueryMode
}): Prisma.PlayerMatchWhereInput {
  const where: Prisma.PlayerMatchWhereInput = {
    uid: params.uid,
  }

  if (params.apiSeasonId !== undefined) {
    where.apiSeasonId = params.apiSeasonId
  }

  const modeFilter = buildGameModeFilter(params.gameMode)
  if (modeFilter) {
    Object.assign(where, modeFilter)
  }

  return where
}

function buildMultiUidSeasonWhere(params: {
  uids: string[]
  apiSeasonId: number
  gameMode?: MatchesQueryMode
}): Prisma.PlayerMatchWhereInput {
  const where: Prisma.PlayerMatchWhereInput = {
    uid: { in: params.uids },
    apiSeasonId: params.apiSeasonId,
  }

  const modeFilter = buildGameModeFilter(params.gameMode)
  if (modeFilter) {
    Object.assign(where, modeFilter)
  }

  return where
}

function loadoutUpdateFields(data: Prisma.PlayerMatchCreateInput): Prisma.PlayerMatchUpdateInput {
  return {
    accountLevel: data.accountLevel,
    characterLevel: data.characterLevel,
    skinCode: data.skinCode,
    bestWeapon: data.bestWeapon,
    bestWeaponLevel: data.bestWeaponLevel,
    tacticalSkillGroup: data.tacticalSkillGroup,
    tacticalSkillLevel: data.tacticalSkillLevel,
    traitFirstCore: data.traitFirstCore,
    traitFirstSub: data.traitFirstSub,
    traitSecondSub: data.traitSecondSub,
    equipment: data.equipment,
    equipmentGrade: data.equipmentGrade,
    routeIdOfStart: data.routeIdOfStart,
    routeSlotId: data.routeSlotId,
    masteryLevel: data.masteryLevel,
    skillLevelInfo: data.skillLevelInfo,
    skillOrderInfo: data.skillOrderInfo,
  }
}

function roleMetricsUpdateFieldsFromInput(
  data: Prisma.PlayerMatchCreateInput,
): Prisma.PlayerMatchUpdateInput {
  if (data.roleMetricsVersion == null) return {}
  return {
    damageFromPlayer: data.damageFromPlayer,
    protectAbsorb: data.protectAbsorb,
    shieldDamageOffsetFromPlayer: data.shieldDamageOffsetFromPlayer,
    teamRecover: data.teamRecover,
    ccTimeToPlayer: data.ccTimeToPlayer,
    viewContribution: data.viewContribution,
    monsterKill: data.monsterKill,
    roleMetricsVersion: data.roleMetricsVersion,
    roleMetricsCapturedAt: data.roleMetricsCapturedAt,
  }
}

function toUpdateFields(
  data: Prisma.PlayerMatchCreateInput,
  context: PlayerMatchStoreContext,
): Prisma.PlayerMatchUpdateInput {
  const update: Prisma.PlayerMatchUpdateInput = {
    apiSeasonId: data.apiSeasonId,
    displaySeasonId: data.displaySeasonId,
    gameMode: data.gameMode,
    matchingMode: data.matchingMode,
    matchingTeamMode: data.matchingTeamMode,
    playedAt: data.playedAt,
    characterNum: data.characterNum,
    characterName: data.characterName,
    placement: data.placement,
    kills: data.kills,
    deaths: data.deaths,
    assists: data.assists,
    teamKills: data.teamKills,
    damageToPlayer: data.damageToPlayer,
    victory: data.victory,
    rpAfter: data.rpAfter,
    rpDelta: data.rpDelta,
    gameDuration: data.gameDuration,
    cobaltInfusions: data.cobaltInfusions,
    ...loadoutUpdateFields(data),
    ...roleMetricsUpdateFieldsFromInput(data),
  }

  if (context.storeRawJson && context.rawJson !== undefined) {
    update.rawJson = context.rawJson as Prisma.InputJsonValue
  }

  return update
}

/** MatchSummaryContract → PlayerMatch upsert payload (없는 값은 null, 가짜 값 금지) */
export function toPlayerMatchInput(
  uid: string,
  match: MatchSummaryContract,
  context: PlayerMatchStoreContext,
): Prisma.PlayerMatchCreateInput {
  const displaySeasonId =
    context.displaySeasonId ?? match.seasonNumber ?? context.apiSeasonId

  const damageToPlayer = match.damageToPlayers ?? match.playerDamage ?? null

  const gameMode = resolveStoredMatchGameMode({
    gameMode: match.gameMode ?? 'normal',
    matchingMode: context.matchingMode ?? null,
    hasCobaltInfusions: Boolean(match.cobaltInfusions && match.cobaltInfusions.length > 0),
  })

  const input: Prisma.PlayerMatchCreateInput = {
    uid,
    apiSeasonId: context.apiSeasonId,
    displaySeasonId,
    gameId: match.matchId,
    gameMode,
    matchingMode: context.matchingMode ?? null,
    matchingTeamMode: context.matchingTeamMode ?? null,
    playedAt: new Date(match.gameStartedAt),
    characterNum: match.characterNum ?? 0,
    characterName: match.characterName?.trim() ? match.characterName : null,
    placement: optionalInt(match.placement),
    kills: optionalInt(match.kills),
    deaths: optionalInt(match.deaths),
    assists: optionalInt(match.assists),
    teamKills: match.teamKills ?? null,
    damageToPlayer,
    victory: match.victory,
    rpAfter: match.rpAfter ?? null,
    rpDelta: match.rpDelta ?? null,
    gameDuration: optionalNullableInt(match.gameDuration),
    cobaltInfusions: toStoredJsonArray(match.cobaltInfusions),
    accountLevel: optionalNullableInt(match.accountLevel),
    characterLevel: optionalNullableInt(match.characterLevel),
    skinCode: optionalNullableInt(match.skinCode),
    bestWeapon: optionalNullableInt(match.bestWeapon),
    tacticalSkillGroup: optionalNullableInt(match.tacticalSkillGroup),
    traitFirstCore: optionalNullableInt(match.traitFirstCore),
    traitFirstSub: toStoredJsonArray(match.traitFirstSub),
    traitSecondSub: toStoredJsonArray(match.traitSecondSub),
    equipment: toStoredJsonEquipment(match.equipment),
    equipmentGrade: toStoredJsonEquipment(match.equipmentGrade),
    routeIdOfStart: optionalNullableInt(match.routeIdOfStart),
    routeSlotId: optionalNullableInt(match.routeSlotId),
  }

  applyRoleMetricsFields(input, match)

  if (context.storeRawJson && context.rawJson !== undefined) {
    input.rawJson = context.rawJson as Prisma.InputJsonValue
  }

  return input
}

export function isPrismaPlayerMatchReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).playerMatch
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { upsert?: unknown }).upsert === 'function' &&
    typeof (delegate as { findMany?: unknown }).findMany === 'function' &&
    typeof (delegate as { count?: unknown }).count === 'function'
  )
}

export async function upsertPlayerMatches(
  prisma: PrismaClient,
  uid: string,
  matches: MatchSummaryContract[],
  context: PlayerMatchStoreContext,
): Promise<number> {
  if (!isPrismaPlayerMatchReady(prisma) || matches.length === 0) {
    return 0
  }

  let upserted = 0
  for (const match of matches) {
    const data = toPlayerMatchInput(uid, match, context)
    await prisma.playerMatch.upsert({
      where: { uid_gameId: { uid, gameId: data.gameId } },
      create: data,
      update: toUpdateFields(data, context),
    })
    upserted += 1
  }

  return upserted
}

/** BSER fresh page 단위 upsert — context 불확실한 match는 skip, 실패 시 failed=true */
export async function upsertFreshPlayerMatches(
  prisma: PrismaClient,
  uid: string,
  freshMatches: FreshPlayerMatchInput[],
  params: UpsertFreshPlayerMatchesParams,
): Promise<UpsertFreshPlayerMatchesResult> {
  if (!isPrismaPlayerMatchReady(prisma) || freshMatches.length === 0) {
    return { upserted: 0, skipped: freshMatches.length, failed: false }
  }

  let upserted = 0
  let skipped = 0

  try {
    for (const { match, matchingMode, matchingTeamMode, rawJson } of freshMatches) {
      const context = resolvePlayerMatchStoreContext({
        match,
        catalog: params.catalog,
        seasonBoundary: params.seasonBoundary,
        matchingMode,
        matchingTeamMode,
      })
      if (!context) {
        skipped += 1
        continue
      }

      if (rawJson != null) {
        const sourceUid = readRawParticipantUid(rawJson)
        if (sourceUid && sourceUid !== uid) {
          skipped += 1
          continue
        }
      }

      await upsertPlayerMatches(prisma, uid, [match], {
        ...context,
        storeRawJson: rawJson != null,
        rawJson,
      })
      upserted += 1
    }

    return { upserted, skipped, failed: false }
  } catch {
    return { upserted, skipped, failed: true }
  }
}

export async function readLatestGameIdForUids(
  prisma: PrismaClient,
  uids: string[],
): Promise<string | null> {
  if (!isPrismaPlayerMatchReady(prisma) || uids.length === 0) return null
  const uniqueUids = [...new Set(uids.filter((uid) => uid.length > 0))]
  const row = await prisma.playerMatch.findFirst({
    where: { uid: { in: uniqueUids } },
    orderBy: [{ playedAt: 'desc' }, { gameId: 'desc' }],
    select: { gameId: true },
  })
  return row?.gameId ?? null
}

export async function readPlayerMatchesForSeason(
  prisma: PrismaClient,
  params: ReadPlayerMatchesForSeasonParams,
): Promise<Prisma.PlayerMatchGetPayload<object>[]> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return []
  }

  return prisma.playerMatch.findMany({
    where: buildSeasonWhere(params),
    orderBy: { playedAt: 'desc' },
    take: params.limit,
    skip: params.offset,
  })
}

export async function countPlayerMatchesForSeason(
  prisma: PrismaClient,
  params: CountPlayerMatchesForSeasonParams,
): Promise<number> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return 0
  }

  return prisma.playerMatch.count({
    where: buildSeasonWhere(params),
  })
}

/** 검증된 source UID 집합 — 단일 IN query 후 gameId dedup */
export async function readPlayerMatchesForVerifiedSources(
  prisma: PrismaClient,
  params: ReadPlayerMatchesForVerifiedSourcesParams,
): Promise<{
  rows: PlayerMatchRow[]
  rawMatchCount: number
  deduplicatedMatchCount: number
}> {
  if (!isPrismaPlayerMatchReady(prisma) || params.uids.length === 0) {
    return { rows: [], rawMatchCount: 0, deduplicatedMatchCount: 0 }
  }

  const uniqueUids = [...new Set(params.uids)]
  const rawRows = (await prisma.playerMatch.findMany({
    where: buildMultiUidSeasonWhere({
      uids: uniqueUids,
      apiSeasonId: params.apiSeasonId,
      gameMode: params.gameMode ?? 'rank',
    }),
    orderBy: { playedAt: 'desc' },
  })) as PlayerMatchRow[]

  const deduped = deduplicatePlayerMatchRowsByGameId(rawRows, params.canonicalUid)
  const ownedRows = filterPlayerMatchRowsByOwner(deduped.rows, params.canonicalUid)
  return {
    rows: ownedRows,
    rawMatchCount: deduped.rawMatchCount,
    deduplicatedMatchCount: ownedRows.length,
  }
}

export async function readLatestAccountLevelFromVerifiedSources(
  prisma: PrismaClient,
  params: { uids: string[]; apiSeasonId: number },
): Promise<number | undefined> {
  if (!isPrismaPlayerMatchReady(prisma) || params.uids.length === 0) {
    return undefined
  }

  const row = await prisma.playerMatch.findFirst({
    where: {
      uid: { in: [...new Set(params.uids)] },
      apiSeasonId: params.apiSeasonId,
      accountLevel: { not: null },
    },
    orderBy: { playedAt: 'desc' },
    select: { accountLevel: true },
  })

  return row?.accountLevel ?? undefined
}

export async function getLatestPlayerMatch(
  prisma: PrismaClient,
  params: GetLatestPlayerMatchParams,
): Promise<Prisma.PlayerMatchGetPayload<object> | null> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return null
  }

  return prisma.playerMatch.findFirst({
    where: buildSeasonWhere(params),
    orderBy: { playedAt: 'desc' },
  })
}

export async function hasPlayerMatch(
  prisma: PrismaClient,
  uid: string,
  gameId: string,
): Promise<boolean> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return false
  }

  const row = await prisma.playerMatch.findUnique({
    where: { uid_gameId: { uid, gameId } },
    select: { id: true },
  })

  return row !== null
}

export type PlayerMatchRecord = {
  uid: string
  apiSeasonId: number
  displaySeasonId: number
  gameId: string
  gameMode: string
  matchingMode?: number | null
  playedAt: Date
  characterNum: number
  characterName: string | null
  placement: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  teamKills: number | null
  damageToPlayer: number | null
  victory: boolean | null
  rpAfter: number | null
  rpDelta: number | null
  gameDuration?: number | null
  cobaltInfusions?: unknown
  accountLevel?: number | null
  characterLevel?: number | null
  skinCode?: number | null
  bestWeapon?: number | null
  bestWeaponLevel?: number | null
  tacticalSkillGroup?: number | null
  tacticalSkillLevel?: number | null
  traitFirstCore?: number | null
  traitFirstSub?: unknown
  traitSecondSub?: unknown
  equipment?: unknown
  equipmentGrade?: unknown
  routeIdOfStart?: number | null
  routeSlotId?: number | null
  roleMetricsVersion?: number | null
  viewContribution?: number | null
  monsterKill?: number | null
  damageFromPlayer?: number | null
  shieldDamageOffsetFromPlayer?: number | null
  teamRecover?: number | null
  rawJson?: unknown
}

/** PlayerMatch row → MatchSummaryContract (가짜 RP/KDA 생성 금지) */
export function toMatchSummaryFromPlayerMatch(
  row: PlayerMatchRecord,
  userNum: number,
  playerTier: RankTier | null = null,
): MatchSummaryContract {
  const damageToPlayer = row.damageToPlayer ?? undefined
  const traitFirstSub = parseStoredIntArray(row.traitFirstSub)
  const traitSecondSub = parseStoredIntArray(row.traitSecondSub)
  const equipment = parseStoredEquipment(row.equipment)
  const equipmentGrade = parseStoredEquipment(row.equipmentGrade)
  const fromTraitSecond = readCobaltInfusionFromTraitSecondSub(traitSecondSub)
  let cobaltInfusions = fromTraitSecond ?? parseStoredIntArray(row.cobaltInfusions)
  if (!cobaltInfusions?.length && row.rawJson != null) {
    cobaltInfusions = readCobaltInfusionArray(row.rawJson)
  }
  const gameMode = resolveStoredMatchGameMode({
    gameMode: row.gameMode,
    matchingMode: row.matchingMode ?? null,
    hasCobaltInfusions: Boolean(cobaltInfusions && cobaltInfusions.length > 0),
  })
  const gradeSupported = isGradeSupportedMode(gameMode)
  const matchGrade = computeMatchPerformanceGrade({
    row,
    playerTier,
    displaySeasonId: row.displaySeasonId,
  })

  return {
    matchId: row.gameId,
    userNum,
    characterNum: row.characterNum,
    characterName: row.characterName?.trim()
      ? row.characterName
      : `실험체 #${row.characterNum}`,
    placement: row.placement ?? 0,
    kills: row.kills ?? 0,
    deaths: row.deaths ?? 0,
    assists: row.assists ?? 0,
    gameStartedAt: row.playedAt.toISOString(),
    victory: row.victory ?? false,
    seasonNumber: row.displaySeasonId,
    rpAfter: row.rpAfter ?? undefined,
    rpDelta: row.rpDelta ?? undefined,
    gameDuration: row.gameDuration ?? undefined,
    cobaltInfusions,
    teamKills: row.teamKills ?? undefined,
    damageToPlayers: damageToPlayer,
    playerDamage: damageToPlayer,
    gameMode,
    accountLevel: row.accountLevel ?? undefined,
    characterLevel: row.characterLevel ?? undefined,
    skinCode: row.skinCode ?? undefined,
    bestWeapon: row.bestWeapon ?? undefined,
    tacticalSkillGroup: row.tacticalSkillGroup ?? undefined,
    traitFirstCore: row.traitFirstCore ?? undefined,
    traitFirstSub,
    traitSecondSub,
    equipment,
    equipmentGrade,
    routeIdOfStart: row.routeIdOfStart ?? undefined,
    routeSlotId: row.routeSlotId ?? undefined,
    ...(gradeSupported
      ? {
          gradeLabel: matchGrade.matchGrade ?? undefined,
          matchGrade: matchGrade.matchGrade ?? undefined,
          matchGradeScore: matchGrade.matchGradeScore ?? undefined,
          matchGradeBaselineTierKey: matchGrade.matchGradeBaselineTierKey ?? undefined,
          matchGradeRole: matchGrade.matchGradeRole ?? undefined,
          matchGradeUsedFallback: matchGrade.matchGradeUsedFallback,
          matchGradeFallback: matchGrade.matchGradeFallback,
          matchGradeOutcomeScore: matchGrade.matchGradeOutcomeScore ?? undefined,
          matchGradeRoleScore: matchGrade.matchGradeRoleScore ?? undefined,
          matchGradeDamageEvidence: matchGrade.matchGradeDamageEvidence,
          matchGradeMetricEvidence: matchGrade.matchGradeMetricEvidence,
        }
      : {}),
  }
}

export interface ReadMatchesPageParams {
  uid: string
  userNum: number
  apiSeasonId: number
  displaySeasonId: number
  mode: MatchesQueryMode
  offset: number
  limit: number
  playerTier?: RankTier | null
}

export interface ReadMatchesPageResult {
  items: MatchSummaryContract[]
  totalCount: number
}

export async function readMatchesPageFromPlayerMatch(
  prisma: PrismaClient,
  params: ReadMatchesPageParams,
): Promise<ReadMatchesPageResult> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return { items: [], totalCount: 0 }
  }

  const seasonParams = {
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    gameMode: params.mode,
  }

  const rows = await readPlayerMatchesForSeason(prisma, {
    ...seasonParams,
    offset: params.offset,
    limit: params.limit,
  })
  const totalCount = await countPlayerMatchesForSeason(prisma, seasonParams)

  return {
    items: rows.map((row) =>
      toMatchSummaryFromPlayerMatch(
        row as PlayerMatchRecord,
        params.userNum,
        params.playerTier ?? null,
      ),
    ),
    totalCount,
  }
}

/** canonical owner uid 행만 반환 — alias/teammate PlayerMatch 병합 금지 */
export async function readMatchesPageFromVerifiedSources(
  prisma: PrismaClient,
  params: ReadMatchesPageParams & { uids?: string[]; aliasUids?: string[]; canonicalUid: string },
): Promise<ReadMatchesPageResult> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return { items: [], totalCount: 0 }
  }

  const ownerUid = params.canonicalUid || params.uid
  const seasonParams = {
    uid: ownerUid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    gameMode: params.mode,
  }

  const rows = (await readPlayerMatchesForSeason(prisma, {
    ...seasonParams,
    offset: params.offset,
    limit: params.limit,
  })) as PlayerMatchRow[]
  const ownedRows = filterPlayerMatchRowsByOwner(rows, ownerUid)
  const totalCount = await countPlayerMatchesForSeason(prisma, seasonParams)

  return {
    items: ownedRows.map((row) =>
      toMatchSummaryFromPlayerMatch(
        row as PlayerMatchRecord,
        params.userNum,
        params.playerTier ?? null,
      ),
    ),
    totalCount,
  }
}

/** season aggregate 입력 — current season rank rows 전체 (playedAt desc) */
export async function readPlayerMatchRankSummariesForAggregate(
  prisma: PrismaClient,
  params: {
    uid: string
    userNum: number
    apiSeasonId: number
    displaySeasonId: number
  },
): Promise<MatchSummaryContract[]> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return []
  }

  const rows = await readPlayerMatchesForSeason(prisma, {
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    gameMode: 'rank',
  })

  return rows.map((row) => toMatchSummaryFromPlayerMatch(row as PlayerMatchRecord, params.userNum))
}

export async function countPlayerMatchRankGamesForSeason(
  prisma: PrismaClient,
  uid: string,
  displaySeasonId: number,
  apiSeasonId: number,
): Promise<number> {
  if (!isPrismaPlayerMatchReady(prisma)) {
    return 0
  }

  return countPlayerMatchesForSeason(prisma, {
    uid,
    apiSeasonId,
    displaySeasonId,
    gameMode: 'rank',
  })
}

/** stripped page row — MatchesCache/collectMatches 소스로 uid+gameId upsert update */
export async function repairPlayerMatchDetailsFromSources(
  prisma: PrismaClient,
  params: {
    uid: string
    canonicalUserNum: number
    apiSeasonId: number
    displaySeasonId: number
    targets: ReadonlyArray<MatchSummaryContract>
    sources: ReadonlyArray<MatchSummaryContract>
  },
): Promise<number> {
  if (!isPrismaPlayerMatchReady(prisma) || params.targets.length === 0) {
    return 0
  }

  const sourceById = new Map<string, MatchSummaryContract>()
  for (const source of params.sources) {
    if (
      matchSummaryHasLoadoutDetail(source) ||
      source.gameDuration != null ||
      (source.cobaltInfusions != null && source.cobaltInfusions.length > 0)
    ) {
      sourceById.set(source.matchId, source)
    }
  }

  const context: PlayerMatchStoreContext = {
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
  }

  const ownerUserNum = params.canonicalUserNum
  let updated = 0
  for (const target of params.targets) {
    const detailed = sourceById.get(target.matchId)
    if (!detailed) continue
    if (detailed.userNum !== ownerUserNum) continue

    const needsLoadoutRepair =
      matchSummaryMissingLoadoutDetail(target) && matchSummaryHasLoadoutDetail(detailed)
    const needsDurationRepair = target.gameDuration == null && detailed.gameDuration != null
    const needsInfusionRepair =
      (target.cobaltInfusions == null || target.cobaltInfusions.length === 0) &&
      detailed.cobaltInfusions != null &&
      detailed.cobaltInfusions.length > 0
    if (!needsLoadoutRepair && !needsDurationRepair && !needsInfusionRepair) continue

    await upsertPlayerMatches(prisma, params.uid, [detailed], context)
    updated += 1
  }

  return updated
}
