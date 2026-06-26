/**
 * 프로필 API live 실측 — 37.7 (pageSize=10, deferred matches 시뮬레이션)
 * Usage: node scripts/measure-profile-live.mjs [nickname]
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const BASE = process.env.MEASURE_API_BASE ?? 'http://localhost:3001'
const NICK = process.argv[2] ?? '절단마술사'
const MATCHES_DEFER_MS = Number(process.env.MEASURE_MATCHES_DEFER_MS ?? 250)
const enc = encodeURIComponent(NICK)

function bust() {
  return `_bust=${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function timed(label, url) {
  const start = performance.now()
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
  const body = await res.text()
  const ms = Math.round(performance.now() - start)
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {
    /* ignore */
  }
  return {
    label,
    ms,
    status: res.status,
    source: parsed?.source ?? null,
    itemCount: parsed?.data?.items?.length ?? null,
    hasNext: parsed?.data?.hasNext ?? null,
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const prisma = new PrismaClient()

console.log(`\n=== ERCraft profile live measure (37.7) — ${NICK} @ ${BASE} ===\n`)

try {
  const health = await fetch(`${BASE}/health`)
  if (!health.ok) throw new Error(`health ${health.status}`)
} catch (e) {
  console.error('Backend unreachable:', e instanceof Error ? e.message : e)
  process.exit(1)
}

const deleted = await prisma.matchesCache.deleteMany({})
console.log(`cleared matches_cache rows: ${deleted.count}\n`)

console.log('--- COLD critical (summary + stats + current season, parallel) ---')
const criticalStart = performance.now()
const [summary, stats, seasons] = await Promise.all([
  timed('summary', `${BASE}/api/players/${enc}/summary?${bust()}`),
  timed('stats', `${BASE}/api/players/${enc}/stats?${bust()}`),
  timed('seasons', `${BASE}/api/players/${enc}/seasons?from=11&to=11&${bust()}`),
])
const criticalWall = Math.round(performance.now() - criticalStart)
for (const row of [summary, stats, seasons]) {
  console.log(`  ${row.label.padEnd(8)} ${String(row.ms).padStart(5)}ms  status=${row.status}`)
}
console.log(`  critical wall: ${criticalWall}ms`)

console.log(`\n--- COLD matches (deferred +${MATCHES_DEFER_MS}ms, pageSize=10) ---`)
await sleep(MATCHES_DEFER_MS)
const matchesCold = await timed(
  'matches',
  `${BASE}/api/players/${enc}/matches?page=0&pageSize=10&${bust()}`,
)
console.log(
  `  ${matchesCold.label.padEnd(8)} ${String(matchesCold.ms).padStart(5)}ms  items=${matchesCold.itemCount}  hasNext=${matchesCold.hasNext}`,
)

const profileColdWall = criticalWall + MATCHES_DEFER_MS + matchesCold.ms
console.log(`  profile cold wall (critical + defer + matches): ${profileColdWall}ms`)

console.log('\n--- WARM matches (page=0 pageSize=10) ---')
const warm1 = await timed('matches#2', `${BASE}/api/players/${enc}/matches?page=0&pageSize=10&${bust()}`)
const warm2 = await timed('matches#3', `${BASE}/api/players/${enc}/matches?page=0&pageSize=10&${bust()}`)
console.log(`  ${warm1.label.padEnd(8)} ${String(warm1.ms).padStart(5)}ms  source=${warm1.source}`)
console.log(`  ${warm2.label.padEnd(8)} ${String(warm2.ms).padStart(5)}ms  source=${warm2.source}`)

console.log('\n--- past season chunk (from=9 to=10) ---')
const pastChunk = await timed(
  'seasons9-10',
  `${BASE}/api/players/${enc}/seasons?from=9&to=10&${bust()}`,
)
console.log(`  ${pastChunk.label.padEnd(8)} ${String(pastChunk.ms).padStart(5)}ms  status=${pastChunk.status}`)

console.log('\n--- additional matches (page=1 pageSize=10) ---')
const addPage = await timed(
  'matches-p1',
  `${BASE}/api/players/${enc}/matches?page=1&pageSize=10&${bust()}`,
)
console.log(`  ${addPage.label.padEnd(8)} ${String(addPage.ms).padStart(5)}ms  items=${addPage.itemCount}`)

const cacheRow = await prisma.matchesCache.findFirst({
  orderBy: { cachedAt: 'desc' },
  select: { id: true, cachedAt: true, expiresAt: true, next: true },
})
if (cacheRow) {
  const row = await prisma.matchesCache.findUnique({
    where: { id: cacheRow.id },
    select: { data: true },
  })
  const count = Array.isArray(row?.data) ? row.data.length : 0
  console.log('\nDB matches_cache:', {
    id: cacheRow.id,
    items: count,
    next: cacheRow.next,
    expiresAt: cacheRow.expiresAt.toISOString(),
  })
}

console.log('\nSee backend dev logs for durationMs / bserRequestCount / uidCache / matchesSource per route.\n')

await prisma.$disconnect()
