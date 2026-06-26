#!/usr/bin/env node
/**
 * 39.8C live smoke — profile character stats / aggregate / cobalt verification.
 *
 * Usage (backend must be running with BSER_API_KEY + DATABASE_URL):
 *   cd backend
 *   node scripts/dev-smoke/profile-verify.mjs
 *   node scripts/dev-smoke/profile-verify.mjs fencing 절단마술사
 *
 * Does NOT delete cache or DB rows.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const API_BASE = (process.env.SMOKE_API_BASE ?? 'http://localhost:3001/api').replace(/\/$/, '')
const DEFAULT_NICKNAMES = ['fencing', '이유랑', '절단마술사']
const REPEAT = Number(process.env.SMOKE_REPEAT ?? 3)

const prisma = new PrismaClient()

function sumGames(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (row.totalGames ?? row.games ?? 0), 0)
}

function countRows(rows) {
  return (rows ?? []).filter((row) => (row.totalGames ?? row.games ?? 0) > 0).length
}

function pickProfileCharacterSource(statsRows, aggregate, aggregateRows) {
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
  const res = await fetch(`${API_BASE}${path}`)
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

async function resolveUidFromSummary(nickname) {
  const summary = await fetchJson(`/players/${encodeURIComponent(nickname)}/summary`)
  return {
    nickname,
    userNum: summary.data?.userNum,
    uid: summary.data?.uid ?? null,
    currentSeason: summary.data?.currentSeason,
  }
}

async function queryDbByUserNum(userNum, displaySeasonId, apiSeasonId) {
  const caches = await prisma.seasonAggregateCache.findMany({
    where: {
      userNum: BigInt(userNum),
      displaySeasonId,
    },
    select: {
      id: true,
      uid: true,
      userNum: true,
      apiSeasonId: true,
      cacheStatus: true,
      characterStats: true,
    },
  })

  const uids = [...new Set(caches.map((row) => row.uid))]
  const rankMatchGroups = []
  for (const uid of uids) {
    const count = await prisma.playerMatch.count({
      where: { uid, apiSeasonId, gameMode: 'rank' },
    })
    rankMatchGroups.push({ uid, count })
  }

  return { caches, rankMatchGroups, distinctUids: uids }
}

async function inspectNickname(nickname, pass) {
  const summaryMeta = await resolveUidFromSummary(nickname)
  const seasonId = summaryMeta.currentSeason ?? 11

  const [statsRes, aggregateRes, cobaltMatchesRes] = await Promise.all([
    fetchJson(`/players/${encodeURIComponent(nickname)}/stats?seasonId=${seasonId}`),
    fetchJson(
      `/players/${encodeURIComponent(nickname)}/season-aggregate?seasonId=${seasonId}`,
    ),
    fetchJson(
      `/players/${encodeURIComponent(nickname)}/matches?page=0&pageSize=10&mode=cobalt`,
    ),
  ])

  const statsRows = statsRes.data?.characterStats ?? []
  const aggregate = aggregateRes.data
  const aggregateRows = aggregate?.characterStats ?? []
  const profilePick = pickProfileCharacterSource(statsRows, aggregate, aggregateRows)

  const cobaltItems = cobaltMatchesRes.data?.items ?? []
  const cobaltWithInfusions = cobaltItems.filter(
    (item) => Array.isArray(item.cobaltInfusions) && item.cobaltInfusions.length > 0,
  )

  const db = await queryDbByUserNum(
    summaryMeta.userNum,
    seasonId,
    aggregate?.apiSeasonId ?? seasonId,
  )

  const cacheForSeason = db.caches.filter((row) => row.apiSeasonId === (aggregate?.apiSeasonId ?? seasonId))

  return {
    pass,
    nickname,
    summaryUserNum: summaryMeta.userNum,
    stats: {
      rowCount: countRows(statsRows),
      gamesSum: sumGames(statsRows),
    },
    aggregate: {
      cacheStatus: aggregate?.cacheStatus,
      source: aggregate?.source,
      basisLabel: aggregate?.basisLabel,
      coverage: aggregate?.coverage ?? null,
      rowCount: countRows(aggregateRows),
      gamesSum: sumGames(aggregateRows),
    },
    profilePick,
    cobalt: {
      matchCount: cobaltItems.length,
      withInfusions: cobaltWithInfusions.length,
      sampleInfusions: cobaltWithInfusions[0]?.cobaltInfusions ?? null,
    },
    db: {
      distinctUids: db.distinctUids,
      uidSplitSuspected: db.distinctUids.length > 1,
      seasonAggregateCacheRows: cacheForSeason.map((row) => ({
        id: row.id,
        uid: row.uid,
        cacheStatus: row.cacheStatus,
        rowCount: countRows(row.characterStats),
        gamesSum: sumGames(row.characterStats),
      })),
      rankMatchGroups: db.rankMatchGroups,
    },
  }
}

function printReport(report) {
  console.log(`\n=== ${report.nickname} (pass ${report.pass}) ===`)
  console.log('summary.userNum:', report.summaryUserNum)
  console.log('stats:', report.stats)
  console.log('aggregate:', report.aggregate)
  console.log('profilePick (UI equivalent):', report.profilePick)
  console.log('cobalt matches:', report.cobalt)
  console.log('db.distinctUids:', report.db.distinctUids, 'split?:', report.db.uidSplitSuspected)
  console.log('db.seasonAggregateCache:', report.db.seasonAggregateCacheRows)
}

function comparePasses(reports) {
  const rowCounts = reports.map((r) => r.profilePick.rows)
  let peak = 0
  let shrunk = false
  for (const count of rowCounts) {
    if (count < peak) shrunk = true
    peak = Math.max(peak, count)
  }
  console.log(`\n[${reports[0]?.nickname}] profilePick rows across ${reports.length} passes:`, rowCounts)
  console.log(`  no shrink after peak: ${shrunk ? 'NO — FAIL' : 'YES'}`)
  return !shrunk
}

async function main() {
  const nicknames = process.argv.slice(2)
  const targets = nicknames.length > 0 ? nicknames : DEFAULT_NICKNAMES

  console.log('SMOKE_API_BASE:', API_BASE)
  console.log('targets:', targets.join(', '))
  console.log('repeat per user:', REPEAT)

  let allStable = true

  for (const nickname of targets) {
    const reports = []
    for (let pass = 1; pass <= REPEAT; pass += 1) {
      try {
        const report = await inspectNickname(nickname, pass)
        printReport(report)
        reports.push(report)
      } catch (error) {
        console.error(`\n=== ${nickname} (pass ${pass}) FAILED ===`)
        console.error(error instanceof Error ? error.message : error)
        allStable = false
      }
    }
    if (reports.length >= 2) {
      allStable = comparePasses(reports) && allStable
    }
  }

  await prisma.$disconnect()
  process.exit(allStable ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
