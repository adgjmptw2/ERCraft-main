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

const cases = [
  { label: '하잉_pm', uid: 'zVJ0XvwMunDcoISMjJUBH_FuG8HD5PQrkjZRFkypp3LS4fyoTjQSxcyk', canonical: 1464399340 },
  { label: '연서_pm', uid: 'sccVLO_h-HgIuMkN12JsSbqciw23MU7t5-vw7oF0dbicdYTsEe1s__Sd', canonical: 239272700 },
  { label: '절단_pm', uid: 'yNEAtPTYG93mN91JUbWiIuQk_Rx2WOyOKfnobLLQ_iM4A4lAhTCuy2VZZlANH3GOQd0v', canonical: 1950017233 },
]

for (const c of cases) {
  for (const apiSeasonId of [20, 39]) {
    const rank = await p.playerMatch.count({ where: { uid: c.uid, apiSeasonId, gameMode: 'rank' } })
    console.log(c.label, 'apiSeason', apiSeasonId, 'rankCount', rank)
  }
  const canonRank20 = await p.playerMatch.count({
    where: { uid: { startsWith: '' }, apiSeasonId: 20, gameMode: 'rank' },
  })
  void canonRank20
  // find uid matching canonical hash with rank rows
  const allUids = await p.playerMatch.findMany({
    where: { apiSeasonId: 39, gameMode: 'rank' },
    select: { uid: true },
    distinct: ['uid'],
    take: 200,
  })
  const canonUid = allUids.find((r) => uidToUserNum(r.uid) === c.canonical)?.uid ?? null
  const canon39 = canonUid
    ? await p.playerMatch.count({ where: { uid: canonUid, apiSeasonId: 39, gameMode: 'rank' } })
    : 0
  const canon20 = canonUid
    ? await p.playerMatch.count({ where: { uid: canonUid, apiSeasonId: 20, gameMode: 'rank' } })
    : 0
  console.log(c.label, 'canonicalUserNum', c.canonical, 'canonUidFound', Boolean(canonUid), 'rank39', canon39, 'rank20', canon20)
}

await p.$disconnect()
