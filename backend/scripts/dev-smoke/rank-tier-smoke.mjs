#!/usr/bin/env node
/**
 * 39.9C — 공식 RP 구간 rank tier helper smoke (backend rankTier.ts)
 *
 * Usage:
 *   cd backend
 *   npm run build
 *   node scripts/dev-smoke/rank-tier-smoke.mjs
 */
import { getRankTierFromRp } from '../../dist/utils/rankTier.js'

const CASES = [
  { rp: 6200, rank: null, expect: '다이아몬드 1' },
  { rp: 6400, rank: null, expect: '메테오라이트 4' },
  { rp: 7150, rank: null, expect: '메테오라이트 1' },
  { rp: 7400, rank: null, expect: '미스릴' },
  { rp: 8000, rank: null, expect: '미스릴' },
  { rp: 8000, rank: 500, expect: '데미갓' },
  { rp: 8000, rank: 200, expect: '이터니티' },
  { rp: 6049, rank: null, expect: '다이아몬드 2' },
  { rp: 6050, rank: null, expect: '다이아몬드 1' },
  { rp: 6000, rank: null, notMithril: true },
]

let failed = 0

console.log('=== rank tier helper smoke ===\n')

for (const c of CASES) {
  const tier = getRankTierFromRp(c.rp, c.rank)
  const label = tier.displayLabel
  let ok = true
  if (c.notMithril && tier.tierNameKo === '미스릴') ok = false
  if (c.expect && label !== c.expect) ok = false
  const rankSuffix = c.rank != null ? ` rank=${c.rank}` : ''
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.rp} RP${rankSuffix} -> ${label}${c.expect ? ` (expected ${c.expect})` : ''}`)
  if (!ok) failed += 1
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${CASES.length - failed}/${CASES.length} passed`)
process.exit(failed === 0 ? 0 : 1)
