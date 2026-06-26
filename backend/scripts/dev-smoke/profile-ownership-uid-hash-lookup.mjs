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

const targets = [1464399340, 239272700, 1950017233, 2036455880, 1031595008]
const uids = await p.playerMatch.findMany({ select: { uid: true }, distinct: ['uid'] })

for (const t of targets) {
  const hits = uids.filter((r) => uidToUserNum(r.uid) === t)
  if (!hits.length) {
    console.log('userNum', t, 'NO uid in player_matches')
    continue
  }
  for (const h of hits) {
    const c39 = await p.playerMatch.count({ where: { uid: h.uid, apiSeasonId: 39, gameMode: 'rank' } })
    const c20 = await p.playerMatch.count({ where: { uid: h.uid, apiSeasonId: 20, gameMode: 'rank' } })
    console.log('userNum', t, 'uid', h.uid.slice(0, 36), 'rank39', c39, 'rank20', c20)
  }
}

await p.$disconnect()
