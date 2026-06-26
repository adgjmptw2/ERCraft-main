#!/usr/bin/env node
/**
 * 39.9C-INVESTIGATION — read-only profile cache trace (no delete/rebuild)
 *
 * Usage:
 *   cd backend
 *   npm run smoke:profile-trace -- fencing
 *   npm run smoke:profile-trace -- fencing --passes=3
 *   npm run smoke:profile-trace -- 이유랑 절단마술사
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHARACTER_NUM_TO_KO = JSON.parse(
  readFileSync(join(__dirname, '../../src/data/characterNumToKo.generated.json'), 'utf8'),
).characterNumToKo

function isNumericCharacterName(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && /^\d+$/.test(trimmed)
}

function resolveCharacterDisplayName(characterNum, characterName) {
  const name = typeof characterName === 'string' ? characterName.trim() : ''
  if (name && !isNumericCharacterName(name)) return name
  if (Number.isInteger(characterNum) && characterNum > 0) {
    const fromMap = CHARACTER_NUM_TO_KO[String(characterNum)]
    if (fromMap) return fromMap
    return `실험체 ${characterNum}`
  }
  return '알 수 없음'
}

function analyzeCharacterNames(rows) {
  const items = (rows ?? []).filter((row) => (row.games ?? row.totalGames ?? 0) > 0)
  let numericNameDetected = 0
  let unnamedCharacterCount = 0
  const resolvedNames = []
  for (const row of items) {
    const num = row.characterNum ?? row.characterCode
    const raw = row.characterName ?? null
    if (raw == null || raw === '') unnamedCharacterCount += 1
    if (isNumericCharacterName(raw)) numericNameDetected += 1
    const resolved = resolveCharacterDisplayName(num, raw)
    resolvedNames.push({ characterNum: num, rawName: raw, resolvedName: resolved })
  }
  return { numericNameDetected, unnamedCharacterCount, resolvedNames }
}

const API_BASE = (process.env.SMOKE_API_BASE ?? 'http://localhost:3001/api').replace(/\/$/, '')
const PASS_GAP_MS = Number(process.env.TRACE_PASS_GAP_MS ?? 1500)

const prisma = new PrismaClient()

function parseArgs(argv) {
  const nicknames = []
  let passes = 3
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--passes=')) {
      passes = Number(arg.slice('--passes='.length))
    } else if (arg === '--passes' && argv[i + 1]) {
      passes = Number(argv[i + 1])
      i += 1
    } else if (!arg.startsWith('--')) {
      nicknames.push(arg)
    }
  }
  return { nicknames, passes }
}

function countRows(rows) {
  return (rows ?? []).filter((row) => (row.totalGames ?? row.games ?? 0) > 0).length
}

function sumGames(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (row.totalGames ?? row.games ?? 0), 0)
}

function pickCharacterSource(statsRows, aggregate, aggregateRows) {
  const statsCount = countRows(statsRows)
  const aggCount = countRows(aggregateRows)
  const statsGames = sumGames(statsRows)
  const aggGames = sumGames(aggregateRows)
  const ready = aggregate?.cacheStatus === 'ready'
  const incomplete =
    aggregate?.cacheStatus === 'partial' ||
    aggregate?.cacheStatus === 'warming' ||
    aggregate?.cacheStatus === 'stale' ||
    aggregate?.isRefreshing === true

  if (ready && aggCount > 0) return { source: 'aggregate', rows: aggCount, games: aggGames }
  if (incomplete && statsCount > 0 && (statsCount > aggCount || statsGames > aggGames)) {
    return { source: 'official-stats', rows: statsCount, games: statsGames }
  }
  if (aggCount > 0) return { source: 'aggregate', rows: aggCount, games: aggGames }
  if (statsCount > 0) return { source: 'official-stats', rows: statsCount, games: statsGames }
  return { source: 'none', rows: 0, games: 0 }
}

async function fetchJson(path) {
  const started = Date.now()
  const res = await fetch(`${API_BASE}${path}`)
  const body = await res.json()
  const ms = Date.now() - started
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)} (${ms}ms)`)
  }
  return { body, ms, apiSource: body.source ?? null }
}

async function resolveUidFromDb(userNum, apiSeasonId) {
  const agg = await prisma.seasonAggregateCache.findFirst({
    where: { userNum: BigInt(userNum), apiSeasonId },
    select: { uid: true },
  })
  if (agg?.uid) return agg.uid
  const pm = await prisma.playerMatch.findFirst({
    where: { userNum: BigInt(userNum) },
    select: { uid: true },
    orderBy: { playedAt: 'desc' },
  })
  return pm?.uid ?? null
}

async function readDbSnapshot(uid, userNum, apiSeasonId, displaySeasonId) {
  const seasonAggId = uid ? `${uid}:${apiSeasonId}` : null
  const backfillId = uid ? `${uid}:${apiSeasonId}` : null

  const [rankCount, allCount, latestMatch, seasonAgg, backfill, matchesAll, matchesRank] =
    await Promise.all([
      uid
        ? prisma.playerMatch.count({ where: { uid, apiSeasonId, gameMode: 'rank' } })
        : Promise.resolve(0),
      uid ? prisma.playerMatch.count({ where: { uid } }) : Promise.resolve(0),
      uid
        ? prisma.playerMatch.findFirst({
            where: { uid, apiSeasonId, gameMode: 'rank' },
            orderBy: { playedAt: 'desc' },
            select: { gameId: true, playedAt: true, apiSeasonId: true, displaySeasonId: true },
          })
        : Promise.resolve(null),
      seasonAggId
        ? prisma.seasonAggregateCache.findUnique({ where: { id: seasonAggId } })
        : Promise.resolve(null),
      backfillId
        ? prisma.playerSeasonBackfillState.findUnique({ where: { id: backfillId } })
        : Promise.resolve(null),
      uid
        ? prisma.matchesCache.findUnique({ where: { id: `${uid}:all` } })
        : Promise.resolve(null),
      uid
        ? prisma.matchesCache.findUnique({ where: { id: `${uid}:rank` } })
        : Promise.resolve(null),
    ])

  return {
    resolvedUid: uid,
    apiSeasonId,
    displaySeasonId,
    playerMatch: {
      rankCount,
      allCount,
      latestPlayedAt: latestMatch?.playedAt?.toISOString?.() ?? null,
      latestGameId: latestMatch?.gameId ?? null,
      latestApiSeasonId: latestMatch?.apiSeasonId ?? null,
      latestDisplaySeasonId: latestMatch?.displaySeasonId ?? null,
    },
    seasonAggregateCache: seasonAgg
      ? {
          id: seasonAgg.id,
          uid: seasonAgg.uid,
          apiSeasonId: seasonAgg.apiSeasonId,
          displaySeasonId: seasonAgg.displaySeasonId,
          cacheStatus: seasonAgg.cacheStatus,
          source: seasonAgg.source,
          characterStatsRows: countRows(seasonAgg.characterStats),
          characterStatsGames: sumGames(seasonAgg.characterStats),
          rpPointCount: Array.isArray(seasonAgg.rpSeries) ? seasonAgg.rpSeries.length : 0,
        }
      : null,
    backfillState: backfill
      ? {
          status: backfill.status,
          collectedGames: backfill.collectedGames,
          officialSeasonGames: backfill.officialSeasonGames,
          nextCursor: backfill.nextCursor,
          retryAfter: backfill.retryAfter?.toISOString?.() ?? null,
          lastStoppedReason: backfill.lastStoppedReason,
          pagesFetchedTotal: backfill.pagesFetchedTotal,
        }
      : null,
    matchesCache: {
      all: matchesAll
        ? {
            id: matchesAll.id,
            expiresAt: matchesAll.expiresAt?.toISOString?.() ?? null,
            itemCount: Array.isArray(matchesAll.items) ? matchesAll.items.length : 0,
          }
        : null,
      rank: matchesRank
        ? {
            id: matchesRank.id,
            expiresAt: matchesRank.expiresAt?.toISOString?.() ?? null,
            itemCount: Array.isArray(matchesRank.items) ? matchesRank.items.length : 0,
          }
        : null,
    },
    userNum,
  }
}

function estimateDecisions(api, db, passNum = 1) {
  const official = api.stats?.games ?? db.backfillState?.officialSeasonGames ?? null
  const rankCount = db.playerMatch.rankCount
  const agg = api.aggregate

  const willCallBserStats =
    api.statsApiSource === 'external' ? 'likely-yes (response source=external)' : 'likely-no (response source=cache)'
  const willCallBserGames =
    api.matchesRank?.apiSource === 'external' || api.matchesAll?.apiSource === 'external'
      ? 'likely-yes (matches source=external)'
      : 'likely-no (matches source=cache)'

  const backfillStatus = agg?.backfillProgress?.status ?? db.backfillState?.status ?? 'unknown'
  const seasonComplete =
    official != null && official > 0 && rankCount >= official

  let willEnqueueBackfill = false
  let enqueueReason = null
  if (seasonComplete) {
    willEnqueueBackfill = false
    enqueueReason = 'season-data-complete'
  } else if (backfillStatus === 'complete') {
    willEnqueueBackfill = false
    enqueueReason = 'backfill-complete'
  } else if (backfillStatus === 'running') {
    willEnqueueBackfill = false
    enqueueReason = 'already-running'
  } else if (official == null || official <= 0) {
    willEnqueueBackfill = false
    enqueueReason = 'no-official-season-games (stats cache cold?)'
  } else if (rankCount < official) {
    willEnqueueBackfill = true
    enqueueReason = 'rankCount < officialSeasonGames'
  }

  const willRebuildAggregate =
    agg?.cacheStatus !== 'ready' && (db.seasonAggregateCache?.cacheStatus !== 'ready')
      ? 'maybe (aggregate not ready)'
      : 'unlikely (cache ready hit)'

  const charPick = pickCharacterSource(
    api.stats?.characterStats ?? [],
    api.aggregate,
    api.aggregate?.characterStats ?? [],
  )

  const hasDisplayableReports =
    charPick.rows > 0 || countRows(api.stats?.characterStats) > 0
  const uiRefreshMode =
    backfillStatus === 'complete' || agg?.isRefreshing === false
      ? 'complete'
      : hasDisplayableReports
        ? 'background'
        : agg?.isRefreshing === true || backfillStatus === 'running' || backfillStatus === 'partial'
          ? 'blocking'
          : 'none'

  return {
    willCallBserStats,
    willCallBserGames,
    willEnqueueBackfill,
    enqueueReason,
    willRebuildAggregate,
    rebuildReason: agg?.cacheStatus !== 'ready' ? `cacheStatus=${agg?.cacheStatus}` : 'ready',
    willUseOfficialStatsForCharacters: charPick.source === 'official-stats',
    willUseAggregateForCharacters: charPick.source === 'aggregate',
    characterSourcePick: charPick,
    seasonDataComplete: seasonComplete,
    latestRefreshExpected: seasonComplete || backfillStatus === 'complete',
    stateCreatedBeforeFetch: db.backfillState != null && passNum === 1,
    staleRunningDetected:
      db.backfillState?.status === 'running' &&
      db.backfillState?.lastRunAt != null &&
      Date.now() - new Date(db.backfillState.lastRunAt).getTime() > 3 * 60_000,
    completeFastPathExpected:
      seasonComplete || backfillStatus === 'complete',
    actualWorkerAction:
      seasonComplete || backfillStatus === 'complete'
        ? 'latest-refresh'
        : db.backfillState == null
          ? 'bootstrap-needed'
          : backfillStatus === 'partial'
            ? 'continue-chunk'
            : backfillStatus === 'running'
              ? 'already-running'
              : 'unknown',
    scheduledNextChunk: backfillStatus === 'partial' && !seasonComplete,
    bserStatsCalled: api.statsApiSource === 'external' && (api.statsLatency ?? 0) > 50,
    bserGamesCalled: api.matchesRank?.apiSource === 'external',
    responseSource: {
      summary: api.summaryApiSource,
      stats: api.statsApiSource,
      matchesRank: api.matchesRank?.apiSource,
      seasonAggregate: api.aggregateApiSource,
    },
    uiRefreshMode,
  }
}

async function runPass(nickname, passNum, seasonId) {
  const enc = encodeURIComponent(nickname)

  const summary = await fetchJson(`/players/${enc}/summary`)
  const s = summary.body.data
  const displaySeasonId = s?.currentSeason ?? seasonId ?? 11

  const stats = await fetchJson(`/players/${enc}/stats?seasonId=${displaySeasonId}`)
  const st = stats.body.data

  const matchesRank = await fetchJson(
    `/players/${enc}/matches?page=0&pageSize=10&mode=rank`,
  )
  const matchesAll = await fetchJson(
    `/players/${enc}/matches?page=0&pageSize=10&mode=all`,
  )

  const aggregate = await fetchJson(
    `/players/${enc}/season-aggregate?seasonId=${displaySeasonId}`,
  )
  const ag = aggregate.body.data

  const apiSeasonId = ag?.apiSeasonId ?? displaySeasonId
  const uid = await resolveUidFromDb(s.userNum, apiSeasonId)
  const db = await readDbSnapshot(uid, s.userNum, apiSeasonId, displaySeasonId)

  const rankItems = matchesRank.body.data?.items ?? []
  const apiBundle = {
    stats: st,
    summaryApiSource: summary.apiSource,
    statsApiSource: stats.apiSource,
    statsLatency: stats.ms,
    aggregate: ag,
    aggregateApiSource: aggregate.apiSource,
    matchesRank: { apiSource: matchesRank.apiSource, count: rankItems.length },
    matchesAll: { apiSource: matchesAll.apiSource, count: matchesAll.body.data?.items?.length ?? 0 },
  }
  const decisions = estimateDecisions(apiBundle, db, passNum)
  const aggregateCharNames = analyzeCharacterNames(ag?.characterStats)
  const statsCharNames = analyzeCharacterNames(st?.characterStats?.map((row) => ({
    characterNum: row.characterCode,
    characterName: row.characterName,
    games: row.totalGames,
  })))

  const report = {
    pass: passNum,
    nickname,
    latencyMs: {
      summary: summary.ms,
      stats: stats.ms,
      matchesRank: matchesRank.ms,
      matchesAll: matchesAll.ms,
      seasonAggregate: aggregate.ms,
    },
    summary: {
      userNum: s?.userNum,
      tier: s?.tier,
      normalizedTier: s?.normalizedTier?.displayLabel ?? null,
      rp: s?.rp ?? null,
      currentSeason: s?.currentSeason,
      apiSource: summary.apiSource,
    },
    stats: {
      officialSeasonGames: st?.games ?? null,
      characterStatsLength: countRows(st?.characterStats),
      characterStatsGamesSum: sumGames(st?.characterStats),
      apiSource: stats.apiSource,
    },
    matchesRank: {
      apiSource: matchesRank.apiSource,
      count: rankItems.length,
      firstGameId: rankItems[0]?.matchId ?? null,
      lastGameId: rankItems[rankItems.length - 1]?.matchId ?? null,
    },
    seasonAggregate: {
      apiSource: aggregate.apiSource,
      cacheStatus: ag?.cacheStatus,
      source: ag?.source,
      isRefreshing: ag?.isRefreshing,
      basisLabel: ag?.basisLabel,
      backfillProgress: ag?.backfillProgress ?? null,
      coverage: ag?.coverage ?? null,
      characterStatsLength: countRows(ag?.characterStats),
      characterStatsGamesSum: sumGames(ag?.characterStats),
      apiSeasonId: ag?.apiSeasonId,
      seasonId: ag?.seasonId,
    },
    db,
    decisions,
    characterNames: {
      aggregate: aggregateCharNames,
      stats: statsCharNames,
    },
  }

  return report
}

function printPass(report) {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`PASS ${report.pass} — ${report.nickname}`)
  console.log('='.repeat(72))
  console.log('latencyMs:', report.latencyMs)
  console.log('summary:', report.summary)
  console.log('stats:', report.stats)
  console.log('matchesRank:', report.matchesRank)
  console.log('seasonAggregate:', report.seasonAggregate)
  console.log('db.resolvedUid:', report.db.resolvedUid)
  console.log('db.playerMatch:', report.db.playerMatch)
  console.log('db.seasonAggregateCache:', report.db.seasonAggregateCache)
  console.log('db.backfillState:', report.db.backfillState)
  console.log('db.matchesCache:', report.db.matchesCache)
  console.log('decisions:', report.decisions)
  console.log('characterNames:', report.characterNames)
}

function comparePasses(reports) {
  const uids = [...new Set(reports.map((r) => r.db.resolvedUid).filter(Boolean))]
  const userNums = [...new Set(reports.map((r) => r.summary.userNum))]
  const apiSeasonIds = reports.map((r) => r.seasonAggregate.apiSeasonId)
  const displayIds = reports.map((r) => r.seasonAggregate.seasonId)

  console.log(`\n${'─'.repeat(72)}`)
  console.log(`UID consistency (${reports[0]?.nickname}):`, uids.length === 1 ? 'uid split 없음' : `SPLIT: ${uids.join(', ')}`)
  console.log('userNum consistency:', userNums.length === 1 ? userNums[0] : userNums)
  console.log('apiSeasonId per pass:', apiSeasonIds)
  console.log('displaySeasonId per pass:', displayIds)
  console.log(
    'seasonAggregate latency trend:',
    reports.map((r) => r.latencyMs.seasonAggregate).join(' → '),
  )
  console.log(
    'isRefreshing trend:',
    reports.map((r) => r.seasonAggregate.isRefreshing).join(' → '),
  )
  console.log(
    'backfill status trend:',
    reports.map((r) => r.seasonAggregate.backfillProgress?.status ?? 'n/a').join(' → '),
  )
  console.log(
    'matches source trend (rank):',
    reports.map((r) => r.matchesRank.apiSource).join(' → '),
  )
  console.log(
    'stats source trend:',
    reports.map((r) => r.stats.apiSource).join(' → '),
  )
  console.log(
    'character source pick:',
    reports.map((r) => r.decisions.characterSourcePick.source).join(' → '),
  )
}

const MATCH_MODES = ['all', 'rank', 'normal', 'cobalt', 'union']
const UNION_MATCHING_MODE_SUPPORTED = false

async function diagnoseMatchModes(nickname, uid) {
  const enc = encodeURIComponent(nickname)
  const modeResults = {}

  for (const mode of MATCH_MODES) {
    try {
      const res = await fetchJson(`/players/${enc}/matches?page=0&pageSize=10&mode=${mode}`)
      const items = res.body.data?.items ?? []
      modeResults[mode] = {
        requestOk: true,
        source: res.apiSource,
        count: items.length,
        gameModes: [...new Set(items.map((item) => item.gameMode).filter(Boolean))],
        firstGameId: items[0]?.matchId ?? null,
      }
    } catch (error) {
      modeResults[mode] = {
        requestOk: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  let dbMatchingModePairs = []
  let unionRowsInDb = 0
  if (uid) {
    const rows = await prisma.playerMatch.findMany({
      where: { uid },
      select: { matchingMode: true, matchingTeamMode: true, gameMode: true },
      take: 120,
      orderBy: { playedAt: 'desc' },
    })
    unionRowsInDb = rows.filter((row) => row.gameMode === 'union').length
    const pairSet = new Set(
      rows.map((row) => `${row.matchingMode ?? 'null'}:${row.matchingTeamMode ?? 'null'}:${row.gameMode}`),
    )
    dbMatchingModePairs = [...pairSet].slice(0, 20)
  }

  const aggregateUrlHasMode = false

  return {
    modeResults,
    unionPredicateResult: {
      unsupportedUnion: !UNION_MATCHING_MODE_SUPPORTED,
      unionApiMappingConfirmed: UNION_MATCHING_MODE_SUPPORTED,
      unionRowsInDb,
      unionModeCount: modeResults.union?.count ?? 0,
    },
    seasonAggregateQueryUsesMatchMode: aggregateUrlHasMode,
    dbMatchingModePairs,
  }
}

async function main() {
  const { nicknames, passes } = parseArgs(process.argv.slice(2))
  const targets = nicknames.length > 0 ? nicknames : ['fencing']

  console.log('TRACE API_BASE:', API_BASE)
  console.log('passes per user:', passes)
  console.log('targets:', targets.join(', '))
  console.log('NOTE: matches page uses page=0 (API 0-indexed first page, pageSize=10)')

  for (const nickname of targets) {
    const reports = []
    for (let pass = 1; pass <= passes; pass += 1) {
      try {
        const report = await runPass(nickname, pass)
        printPass(report)
        reports.push(report)
      } catch (error) {
        console.error(`\nPASS ${pass} — ${nickname} FAILED:`, error instanceof Error ? error.message : error)
      }
      if (pass < passes) {
        await new Promise((r) => setTimeout(r, PASS_GAP_MS))
      }
    }
    if (reports.length >= 2) {
      comparePasses(reports)
    }

    const lastUid = reports[reports.length - 1]?.db?.resolvedUid ?? null
    try {
      const matchModes = await diagnoseMatchModes(nickname, lastUid)
      console.log(`\n${'─'.repeat(72)}`)
      console.log(`MATCH MODES (${nickname})`)
      console.log('modeResults:', matchModes.modeResults)
      console.log('union:', matchModes.unionPredicateResult)
      console.log('seasonAggregateQueryUsesMatchMode:', matchModes.seasonAggregateQueryUsesMatchMode)
      console.log('dbMatchingModePairs (sample):', matchModes.dbMatchingModePairs)
    } catch (error) {
      console.error(`MATCH MODES (${nickname}) FAILED:`, error instanceof Error ? error.message : error)
    }
  }

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
