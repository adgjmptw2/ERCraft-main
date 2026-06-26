#!/usr/bin/env node
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

function uidToUserNum(uid) {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

const uids = {
  '하잉_pm': 'zVJ0XvwMunDcoISMjJUBH_FuG8HD5PQrkjZRFkypp3LS4fyoTjQSxcyk',
  '연서_pm': 'sccVLO_h-HgIuMkN12JsSbqciw23MU7t5-vw7oF0dbicdYTsEe1s__Sd',
  '절단_pm': 'yNEAtPTYG93mN91JUbWiIuQk_Rx2WOyOKfnobLLQ_iM4A4lAhTCuy2VZZlANH3GOQd0v',
  '절단_pm2': 'zcWRCe4ZUuhamVWiDvai6cdPX6niOItyfjatUfU9uHZEqS9EshzgHw9x5V3Y_TRtUU1c',
  'fencing_pm': 'zmeDqmV0lS3Eb6UtXF00veO77V8NpQsb_ctDTE76WM4nAN-k0ZzTD_0',
}

for (const [label, uid] of Object.entries(uids)) {
  const total = await p.playerMatch.count({ where: { uid } })
  const rank = await p.playerMatch.count({ where: { uid, apiSeasonId: 20, gameMode: 'rank' } })
  console.log(label, { userNum: uidToUserNum(uid), total, rankS11: rank })
}

const targets = [1464399340, 239272700, 1950017233, 1152396682, 965221006, 2036455880, 1031595008, 1727837593, 1729533461]
const all = await p.playerMatch.groupBy({
  by: ['uid'],
  _count: { _all: true },
  orderBy: { _count: { _all: 'desc' } },
  take: 50,
})

console.log('\n=== hash target lookup ===')
for (const t of targets) {
  const hits = all.filter((r) => uidToUserNum(r.uid) === t)
  for (const hit of hits) {
    const rank = await p.playerMatch.count({ where: { uid: hit.uid, apiSeasonId: 20, gameMode: 'rank' } })
    console.log('userNum', t, 'pmTotal', hit._count._all, 'rankS11', rank, 'uidPrefix', hit.uid.slice(0, 24))
  }
  if (hits.length === 0) console.log('userNum', t, 'NO player_match rows in top-50 uids')
}

await p.$disconnect()
