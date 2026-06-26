#!/usr/bin/env node
/**
 * 39.10AA — live read-path verification (DEV)
 * Usage: cd backend && node scripts/dev-smoke/profile-aa-live-verify.mjs [nicknames...]
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const API_BASE = (process.env.SMOKE_API_BASE ?? 'http://127.0.0.1:3001/api').replace(/\/$/, '')
const NICKS = process.argv.slice(2).length ? process.argv.slice(2) : ['하잉', '연서', '절단마술사']
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

async function pmCountsForUserNums(userNums, apiSeasonId = 39) {
  const all = await prisma.playerMatch.findMany({ select: { uid: true }, distinct: ['uid'] })
  const uidByNum = new Map()
  for (const row of all) {
    uidByNum.set(uidToUserNum(row.uid), row.uid)
  }
  const result = {}
  for (const num of userNums) {
    const uid = uidByNum.get(num)
    if (!uid) {
      result[num] = { uid: null, rank39: 0 }
      continue
    }
    const rank39 = await prisma.playerMatch.count({
      where: { uid, apiSeasonId, gameMode: 'rank' },
    })
    result[num] = { uid, rank39 }
  }
  return result
}

async function verifyNick(nick) {
  const enc = encodeURIComponent(nick)
  const coldSummary = await fetchJson(`/players/${enc}/summary`)
  const matches = await fetchJson(`/players/${enc}/matches?page=0&pageSize=10`)
  const coldStats = await fetchJson(`/players/${enc}/stats`)
  const warmSummary = await fetchJson(`/players/${enc}/summary`)
  const warmStats = await fetchJson(`/players/${enc}/stats`)
  const seasons = await fetchJson(`/players/${enc}/seasons?from=1&to=11`)

  const s = coldSummary.body.data
  const st = coldStats.body.data
  const meta = st?.playerMatchCharacterStatsMeta
  const chars = st?.playerMatchCharacterStats ?? []
  const first = chars[0]

  const ownerAligned =
    s?.userNum === st?.userNum && s?.userNum === seasons.body.data?.owner?.userNum

  return {
    nickname: nick,
    timingMs: {
      coldSummary: coldSummary.ms,
      coldStats: coldStats.ms,
      warmSummary: warmSummary.ms,
      warmStats: warmStats.ms,
      seasons: seasons.ms,
      matches: matches.ms,
    },
    summary: {
      userNum: s?.userNum,
      level: s?.level,
      tier: s?.tier,
      rp: s?.rp,
    },
    stats: {
      userNum: st?.userNum,
      games: st?.games,
      meta,
      charRows: chars.length,
      firstChar: first
        ? {
            name: first.characterName,
            games: first.games,
            teamKills: first.teamKills,
            kda: first.kda,
            damage: first.damageToPlayers ?? first.playerDamage,
          }
        : null,
    },
    seasons: {
      ownerUserNum: seasons.body.data?.owner?.userNum,
      source: seasons.body.data?.source,
      seasonCount: seasons.body.data?.seasons?.length,
    },
    matches: {
      count: matches.body.data?.items?.length,
      firstLevel: matches.body.data?.items?.[0]?.accountLevel,
    },
    ownerAligned,
  }
}

const reports = []
for (const nick of NICKS) {
  reports.push(await verifyNick(nick))
}

console.log(JSON.stringify({ reports }, null, 2))
await prisma.$disconnect()
