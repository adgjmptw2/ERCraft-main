/**
 * 콜드/경합 실측 — backend 재시작 직후 또는 matches_cache 삭제 후 실행
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const BASE = process.env.MEASURE_API_BASE ?? 'http://localhost:3001'
const NICK = process.argv[2] ?? '절단마술사'
const enc = encodeURIComponent(NICK)
const bust = () => `_bust=${Date.now()}-${Math.random().toString(36).slice(2)}`

async function timed(label, url) {
  const start = performance.now()
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
  const ms = Math.round(performance.now() - start)
  return { label, ms, status: res.status }
}

const prisma = new PrismaClient()
await prisma.matchesCache.deleteMany({})
await prisma.$disconnect()

console.log(`\n=== contention measure — ${NICK} ===\n`)

console.log('1) COLD all parallel (no defer, pageSize=10)')
const wallStart = performance.now()
const cold = await Promise.all([
  timed('summary', `${BASE}/api/players/${enc}/summary?${bust()}`),
  timed('stats', `${BASE}/api/players/${enc}/stats?${bust()}`),
  timed('seasons', `${BASE}/api/players/${enc}/seasons?from=11&to=11&${bust()}`),
  timed('matches', `${BASE}/api/players/${enc}/matches?page=0&pageSize=10&${bust()}`),
])
console.log('wall', Math.round(performance.now() - wallStart) + 'ms')
for (const r of cold) console.log(`  ${r.label} ${r.ms}ms status=${r.status}`)

console.log('\n2) matches in-flight + summary refresh (50ms later)')
await prisma.matchesCache.deleteMany({})
const matchesPromise = fetch(
  `${BASE}/api/players/${enc}/matches?page=0&pageSize=10&${bust()}`,
  { headers: { 'Cache-Control': 'no-cache' } },
)
await new Promise((r) => setTimeout(r, 50))
const refresh = await timed('summary-refresh', `${BASE}/api/players/${enc}/summary?${bust()}`)
const matchesRes = await matchesPromise
console.log(`  summary-refresh ${refresh.ms}ms status=${refresh.status}`)
console.log(`  matches-done status=${matchesRes.status}`)

console.log('\n3) past seasons + summary parallel')
const chunk = await Promise.all([
  timed('summary', `${BASE}/api/players/${enc}/summary?${bust()}`),
  timed('seasons9-10', `${BASE}/api/players/${enc}/seasons?from=9&to=10&${bust()}`),
])
for (const r of chunk) console.log(`  ${r.label} ${r.ms}ms status=${r.status}`)

console.log('\nCheck backend logs for bserRequestCount per route.\n')
