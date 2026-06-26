#!/usr/bin/env node
/**
 * 39.10Y — profile data ownership diagnostic (DEV only).
 * Usage: cd backend && node scripts/dev-smoke/profile-ownership-diagnostic.mjs [nicknames...]
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const API_BASE = (process.env.SMOKE_API_BASE ?? 'http://localhost:3001/api').replace(/\/$/, '')
const NICKNAMES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['하잉', '연서', '절단마술사', 'fencing']

const prisma = new PrismaClient()

function uidToUserNum(uid) {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

async function fetchJson(path) {
  const started = Date.now()
  const res = await fetch(`${API_BASE}${path}`)
  const body = await res.json()
  return { status: res.status, ms: Date.now() - started, body }
}

function squadFingerprint(stats) {
  const squad = stats?.find?.((row) => row.matchingTeamMode === 3) ?? stats?.[0]
  if (!squad || (squad.totalGames ?? 0) <= 0) return null
  return { totalGames: squad.totalGames, mmr: squad.mmr }
}

async function findUidCandidates(nickname, apiSeasonId = 20) {
  const trimmed = nickname.trim()
  const uids = new Set()

  if (typeof prisma.matchParticipant?.findMany === 'function') {
    const participants = await prisma.matchParticipant.findMany({
      where: { nickname: trimmed },
      select: { uid: true, nickname: true },
      distinct: ['uid'],
      take: 16,
    })
    for (const row of participants) {
      if (row.uid) uids.add(row.uid)
    }
  }

  const backfillStates = await prisma.playerSeasonBackfillState.findMany({
    where: { apiSeasonId },
    select: { uid: true, status: true, collectedGames: true },
    orderBy: { collectedGames: 'desc' },
    take: 64,
  })

  const seasonCaches = await prisma.seasonStatsCache.findMany({
    where: { id: { contains: `:${apiSeasonId}` } },
    select: { id: true, data: true },
    take: 200,
  })

  for (const cache of seasonCaches) {
    const uid = cache.id.split(':')[0]
    if (!uid) continue
    const data = cache.data
    const rows = Array.isArray(data) ? data : []
    const nick = rows[0]?.nickname
    if (typeof nick === 'string' && nick.trim().toLowerCase() === trimmed.toLowerCase()) {
      uids.add(uid)
    }
  }

  const aggregates = await prisma.seasonAggregateCache.findMany({
    where: { apiSeasonId },
    select: { uid: true },
    take: 64,
  })
  for (const row of aggregates) uids.add(row.uid)

  return [...uids]
}

async function uidInventory(uid, apiSeasonId = 20, displaySeasonId = 11) {
  const [pmTotal, pmRankSeason, pmLatest, refreshState, statsCache] = await Promise.all([
    prisma.playerMatch.count({ where: { uid } }),
    prisma.playerMatch.count({ where: { uid, apiSeasonId, gameMode: 'rank' } }),
    prisma.playerMatch.findFirst({
      where: { uid },
      orderBy: { playedAt: 'desc' },
      select: { gameId: true, playedAt: true, gameMode: true, apiSeasonId: true },
    }),
    prisma.playerProfileRefreshState.findUnique({ where: { uid } }).catch(() => null),
    prisma.seasonStatsCache.findUnique({ where: { id: `${uid}:${apiSeasonId}` } }).catch(() => null),
  ])

  let statsNickname = null
  let fingerprint = null
  if (statsCache?.data) {
    const rows = Array.isArray(statsCache.data) ? statsCache.data : []
    statsNickname = rows[0]?.nickname ?? null
    fingerprint = squadFingerprint(rows)
  }

  return {
    uid,
    userNum: uidToUserNum(uid),
    pmTotal,
    pmRankCurrentSeason: pmRankSeason,
    latestMatch: pmLatest,
    manualRefreshAt: refreshState?.manualRefreshedAt?.toISOString?.() ?? null,
    statsCacheNickname: statsNickname,
    statsFingerprint: fingerprint,
  }
}

async function diagnoseNickname(nickname) {
  const enc = encodeURIComponent(nickname)
  const [summary, stats, matches, seasons] = await Promise.all([
    fetchJson(`/players/${enc}/summary`),
    fetchJson(`/players/${enc}/stats`),
    fetchJson(`/players/${enc}/matches?page=0&pageSize=10`),
    fetchJson(`/players/${enc}/seasons?from=1&to=11`),
  ])

  const s = summary.body.data
  const st = stats.body.data
  const m = matches.body.data
  const se = seasons.body.data

  const apiSeasonId = 20
  const displaySeasonId = s?.currentSeason ?? 11
  const candidates = await findUidCandidates(nickname, apiSeasonId)
  const inventories = await Promise.all(candidates.map((uid) => uidInventory(uid, apiSeasonId, displaySeasonId)))

  const summaryUserNum = s?.userNum ?? null
  const summaryUid = inventories.find((row) => row.userNum === summaryUserNum)?.uid ?? null
  const pmRows = st?.playerMatchCharacterStats?.length ?? 0
  const officialRows = st?.characterStats?.filter((r) => r.totalGames > 0).length ?? 0
  const matchGameIds = (m?.items ?? []).map((row) => row.matchId)
  const pmForMatchIds = matchGameIds.length
    ? await prisma.playerMatch.findMany({
        where: { gameId: { in: matchGameIds } },
        select: { gameId: true, uid: true },
      })
    : []

  const pmOwnerByGameId = Object.fromEntries(pmForMatchIds.map((row) => [row.gameId, row.uid]))

  return {
    nickname,
    timingMs: { summary: summary.ms, stats: stats.ms, matches: matches.ms, seasons: seasons.ms },
    api: {
      summary: {
        userNum: summaryUserNum,
        level: s?.level ?? null,
        tier: s?.tier ?? null,
        rp: s?.rp ?? null,
        currentSeason: s?.currentSeason ?? null,
        hasProfileCache: s?.hasProfileCache ?? null,
      },
      stats: {
        userNum: st?.userNum ?? null,
        metaUserNum: st?.playerMatchCharacterStatsMeta?.userNum ?? null,
        metaStatus: st?.playerMatchCharacterStatsMeta?.status ?? null,
        metaRowCount: st?.playerMatchCharacterStatsMeta?.rowCount ?? null,
        pmRowCount: pmRows,
        officialRowCount: officialRows,
        games: st?.games ?? null,
        mmr: st?.mmr ?? null,
      },
      matches: {
        itemCount: m?.items?.length ?? 0,
        firstUserNum: m?.items?.[0]?.userNum ?? null,
        firstGameId: m?.items?.[0]?.matchId ?? null,
        firstAccountLevel: m?.items?.[0]?.accountLevel ?? null,
      },
      seasons: {
        ownerUserNum: se?.owner?.userNum ?? null,
        ownerNickname: se?.owner?.nickname ?? null,
        seasonCount: se?.seasons?.length ?? 0,
      },
    },
    resolvedSummaryUid: summaryUid,
    uidCandidates: inventories.sort((a, b) => b.pmRankCurrentSeason - a.pmRankCurrentSeason),
    recentMatchPlayerMatchOwners: matchGameIds.slice(0, 5).map((gameId) => ({
      gameId,
      pmUid: pmOwnerByGameId[gameId] ?? null,
      pmUserNum: pmOwnerByGameId[gameId] ? uidToUserNum(pmOwnerByGameId[gameId]) : null,
    })),
  }
}

async function measureSummaryPerf(nickname) {
  const enc = encodeURIComponent(nickname)
  const cold = await fetchJson(`/players/${enc}/summary?refresh=true`)
  const warm = await fetchJson(`/players/${enc}/summary`)
  const parallel = await Promise.all([
    fetchJson(`/players/${enc}/summary`),
    fetchJson(`/players/${enc}/stats`),
  ])
  return {
    nickname,
    coldSummaryMs: cold.ms,
    warmSummaryMs: warm.ms,
    parallelSummaryMs: parallel[0].ms,
    parallelStatsMs: parallel[1].ms,
  }
}

async function main() {
  console.log('=== 39.10Y Profile Ownership Diagnostic ===\n')
  const reports = []
  for (const nickname of NICKNAMES) {
    try {
      reports.push(await diagnoseNickname(nickname))
    } catch (e) {
      reports.push({ nickname, error: String(e) })
    }
  }
  console.log(JSON.stringify({ reports }, null, 2))

  console.log('\n=== Summary perf sample (first nickname) ===')
  try {
    console.log(JSON.stringify(await measureSummaryPerf(NICKNAMES[0]), null, 2))
  } catch (e) {
    console.log(JSON.stringify({ error: String(e) }))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
