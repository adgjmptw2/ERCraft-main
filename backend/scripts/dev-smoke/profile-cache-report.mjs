#!/usr/bin/env node
/**
 * 39.9C — profile / backfill / tier live smoke report
 *
 * Usage (backend running, BSER_API_KEY + DATABASE_URL):
 *   cd backend
 *   node scripts/dev-smoke/profile-cache-report.mjs
 *   node scripts/dev-smoke/profile-cache-report.mjs fencing 절단마술사
 *   npm run smoke:profile-cache -- fencing
 *
 * Does NOT delete cache or DB rows.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const API_BASE = (process.env.SMOKE_API_BASE ?? 'http://localhost:3001/api').replace(/\/$/, '')
const DEFAULT_NICKNAMES = ['fencing', '절단마술사', '아드마이할게요']
const WAIT_BACKFILL_MS = Number(process.env.SMOKE_WAIT_MS ?? 8000)

const prisma = new PrismaClient()

function countRows(rows) {
  return (rows ?? []).filter((row) => (row.totalGames ?? row.games ?? 0) > 0).length
}

function sumGames(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (row.totalGames ?? row.games ?? 0), 0)
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
  const started = Date.now()
  const res = await fetch(`${API_BASE}${path}`)
  const body = await res.json()
  const ms = Date.now() - started
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)} (${ms}ms)`)
  }
  return { body, ms }
}

async function resolveUid(userNum, apiSeasonId) {
  const cache = await prisma.seasonAggregateCache.findFirst({
    where: { userNum: BigInt(userNum), apiSeasonId },
    select: { uid: true },
  })
  if (cache?.uid) return cache.uid
  const match = await prisma.playerMatch.findFirst({
    where: { userNum: BigInt(userNum) },
    select: { uid: true },
  })
  return match?.uid ?? null
}

async function readBackfillState(uid, apiSeasonId) {
  if (!uid) return null
  const id = `${uid}:${apiSeasonId}`
  try {
    return await prisma.playerSeasonBackfillState.findUnique({ where: { id } })
  } catch {
    return null
  }
}

async function inspectNickname(nickname, passLabel) {
  const summaryRes = await fetchJson(`/players/${encodeURIComponent(nickname)}/summary`)
  const summary = summaryRes.body.data
  const seasonId = summary?.currentSeason ?? 11

  // 프로필 진입 순서와 동일 — stats 캐시 warm + backfill enqueue
  await fetchJson(`/players/${encodeURIComponent(nickname)}/stats?seasonId=${seasonId}`)

  const [statsRes, aggregateRes] = await Promise.all([
    fetchJson(`/players/${encodeURIComponent(nickname)}/stats?seasonId=${seasonId}`),
    fetchJson(
      `/players/${encodeURIComponent(nickname)}/season-aggregate?seasonId=${seasonId}`,
    ),
  ])

  const stats = statsRes.body.data
  const aggregate = aggregateRes.body.data
  const apiSeasonId = aggregate?.apiSeasonId ?? seasonId
  const uid = await resolveUid(summary?.userNum, apiSeasonId)

  let backfillBefore = await readBackfillState(uid, apiSeasonId)
  const rankCountBefore = uid
    ? await prisma.playerMatch.count({ where: { uid, apiSeasonId, gameMode: 'rank' } })
    : 0

  await new Promise((r) => setTimeout(r, WAIT_BACKFILL_MS))

  const aggregateRes2 = await fetchJson(
    `/players/${encodeURIComponent(nickname)}/season-aggregate?seasonId=${seasonId}`,
  )
  const aggregate2 = aggregateRes2.body.data
  const backfillAfter = await readBackfillState(uid, apiSeasonId)
  const rankCountAfter = uid
    ? await prisma.playerMatch.count({ where: { uid, apiSeasonId, gameMode: 'rank' } })
    : 0

  const statsRows = stats?.characterStats ?? []
  const aggregateRows = aggregate?.characterStats ?? []
  const profilePick = pickProfileCharacterSource(statsRows, aggregate, aggregateRows)

  const officialSeasonGames =
    aggregate?.coverage?.officialSeasonGames ?? stats?.games ?? null
  const isComplete =
    backfillAfter?.status === 'complete' ||
    (officialSeasonGames != null && rankCountAfter >= officialSeasonGames)
  const latestRefreshExpected = isComplete && backfillAfter?.status === 'complete'

  const rp = summary?.rp ?? stats?.mmr ?? null
  const tierLabel = summary?.normalizedTier?.displayLabel ?? summary?.tier ?? null
  const tierIsMithrilIn6k = rp != null && rp >= 6000 && rp < 7400 && tierLabel?.includes('미스릴')

  return {
    passLabel,
    nickname,
    resolvedUid: uid,
    rp,
    mmr: stats?.mmr ?? null,
    normalizedTier: summary?.normalizedTier ?? null,
    tierDisplayLabel: tierLabel,
    leaderboardRank: summary?.leaderboardRank ?? null,
    tier6kNotMithril: tierIsMithrilIn6k ? 'FAIL' : rp != null && rp >= 6000 && rp < 7400 ? 'OK' : 'n/a',
    officialSeasonGames,
    playerMatchRankCount: { before: rankCountBefore, after: rankCountAfter },
    backfillState: {
      before: backfillBefore,
      after: backfillAfter,
    },
    aggregate: {
      firstMs: aggregateRes.ms,
      secondMs: aggregateRes2.ms,
      cacheStatus: aggregate?.cacheStatus,
      source: aggregate?.source,
      basisLabel: aggregate?.basisLabel,
      isRefreshing: aggregate?.isRefreshing,
      coverage: aggregate?.coverage ?? null,
      backfillProgress: aggregate?.backfillProgress ?? null,
    },
    characterStats: {
      statsRowCount: countRows(statsRows),
      aggregateRowCount: countRows(aggregateRows),
      selectedSource: profilePick.source,
      selectedRows: profilePick.rows,
    },
    willEnqueueBackfill:
      officialSeasonGames > 0 &&
      rankCountAfter < officialSeasonGames &&
      backfillAfter?.status !== 'complete',
    latestRefreshExpected,
    pageSizeCheck: '10 (matches route unchanged — verify manually if needed)',
  }
}

function printReport(r) {
  console.log(`\n=== ${r.nickname} (${r.passLabel}) ===`)
  console.log('resolvedUid:', r.resolvedUid ?? '(unknown — cache empty)')
  console.log('RP:', r.rp, '| mmr:', r.mmr)
  console.log('normalizedTier:', r.normalizedTier?.displayLabel ?? r.tierDisplayLabel)
  console.log('leaderboardRank:', r.leaderboardRank)
  console.log('6k-tier-not-mithril:', r.tier6kNotMithril)
  console.log('officialSeasonGames:', r.officialSeasonGames)
  console.log('PlayerMatch rank count:', r.playerMatchRankCount)
  console.log('BackfillState BEFORE:', formatBackfill(r.backfillState.before))
  console.log('BackfillState AFTER (+wait):', formatBackfill(r.backfillState.after))
  console.log('aggregate 1st:', r.aggregate.firstMs + 'ms', '| 2nd:', r.aggregate.secondMs + 'ms')
  console.log('aggregate:', {
    cacheStatus: r.aggregate.cacheStatus,
    source: r.aggregate.source,
    basisLabel: r.aggregate.basisLabel,
    isRefreshing: r.aggregate.isRefreshing,
    coverage: r.aggregate.coverage,
    backfillProgress: r.aggregate.backfillProgress,
  })
  console.log('characterStats:', r.characterStats)
  console.log('willEnqueueBackfill:', r.willEnqueueBackfill)
  console.log('latestRefreshExpected:', r.latestRefreshExpected)
}

function formatBackfill(row) {
  if (!row) return null
  return {
    status: row.status,
    collectedGames: row.collectedGames,
    nextCursor: row.nextCursor,
    pagesFetchedTotal: row.pagesFetchedTotal,
    lastStoppedReason: row.lastStoppedReason,
    retryAfter: row.retryAfter?.toISOString?.() ?? row.retryAfter,
  }
}

async function main() {
  const nicknames = process.argv.slice(2)
  const targets = nicknames.length > 0 ? nicknames : DEFAULT_NICKNAMES

  console.log('SMOKE_API_BASE:', API_BASE)
  console.log('WAIT_BACKFILL_MS:', WAIT_BACKFILL_MS)
  console.log('targets:', targets.join(', '))

  let failed = 0
  const reports = []

  for (const nickname of targets) {
    try {
      const report = await inspectNickname(nickname, 'live')
      printReport(report)
      reports.push(report)
      if (report.tier6kNotMithril === 'FAIL') failed += 1
      if (report.aggregate.firstMs > 2000) {
        console.warn('WARN: season-aggregate 1st response > 2s')
      }
      if (report.characterStats.selectedRows === 0 && report.characterStats.statsRowCount > 0) {
        console.warn('WARN: official stats exist but selected source is empty')
        failed += 1
      }
    } catch (error) {
      console.error(`\n=== ${nickname} FAILED ===`)
      console.error(error instanceof Error ? error.message : error)
      failed += 1
    }
  }

  await prisma.$disconnect()
  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${reports.length} users inspected, ${failed} issue(s)`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
