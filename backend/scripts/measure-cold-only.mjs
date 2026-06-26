/**
 * 서버 재시작 직후 1회만 실행 — 콜드 parallel / 경합 실측
 */
import 'dotenv/config'

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

console.log(`\n=== cold-only measure — ${NICK} (run once after server restart) ===\n`)

console.log('A) all parallel, pageSize=10, NO defer')
const wallA = performance.now()
const parallel = await Promise.all([
  timed('summary', `${BASE}/api/players/${enc}/summary?${bust()}`),
  timed('stats', `${BASE}/api/players/${enc}/stats?${bust()}`),
  timed('seasons', `${BASE}/api/players/${enc}/seasons?from=11&to=11&${bust()}`),
  timed('matches', `${BASE}/api/players/${enc}/matches?page=0&pageSize=10&${bust()}`),
])
console.log('wall', Math.round(performance.now() - wallA) + 'ms')
for (const r of parallel) console.log(`  ${r.label} ${r.ms}ms status=${r.status}`)

console.log('\nB) matches starts, summary refresh +50ms later')
const matchesP = fetch(
  `${BASE}/api/players/${enc}/matches?page=0&pageSize=10&${bust()}`,
  { headers: { 'Cache-Control': 'no-cache' } },
)
await new Promise((r) => setTimeout(r, 50))
const refresh = await timed('summary-refresh', `${BASE}/api/players/${enc}/summary?${bust()}`)
const matchesStatus = (await matchesP).status
console.log(`  summary-refresh ${refresh.ms}ms status=${refresh.status}`)
console.log(`  matches status=${matchesStatus}`)

console.log('\nSee backend logs for per-route bserRequestCount.\n')
