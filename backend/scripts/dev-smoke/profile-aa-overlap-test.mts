import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const p = new PrismaClient()
const a = 'Agb5ReWV_bklDabn_oii5WbsUg6MKj5iLmdqb2J4H1Ila2aXDEfFIyN6'
const b = 'zVJ0XvwMunDcoISMjJUBH_FuG8HD5PQrkjZRFkypp3LS4fyoTjQSxcyk'
const rowsA = await p.playerMatch.findMany({
  where: { uid: a, apiSeasonId: 39, gameMode: 'rank' },
  select: { gameId: true },
})
const gids = rowsA.map((r) => r.gameId)
const overlap = await p.playerMatch.count({
  where: { uid: b, apiSeasonId: 39, gameMode: 'rank', gameId: { in: gids } },
})
console.log({ a: uidToUserNum(a), b: uidToUserNum(b), gamesA: gids.length, overlap })
await p.$disconnect()
