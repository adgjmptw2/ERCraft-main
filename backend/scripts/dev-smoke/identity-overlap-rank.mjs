import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.js'

const API_SEASON = 39
const USERS = ['하잉', '연서', '절단마술사']
const prisma = new PrismaClient()

async function bestOverlapUid(nickname) {
  const participants = await prisma.matchParticipant.findMany({
    where: { nickname },
    select: { gameId: true },
    distinct: ['gameId'],
    take: 32,
  })
  const gameIds = participants.map((p) => p.gameId).filter(Boolean)
  if (gameIds.length === 0) return null

  const pmRows = await prisma.playerMatch.findMany({
    where: { gameId: { in: gameIds }, gameMode: 'rank', apiSeasonId: API_SEASON },
    select: { uid: true, gameId: true, accountLevel: true },
  })

  const overlapByUid = new Map()
  for (const row of pmRows) {
    const bucket = overlapByUid.get(row.uid) ?? { games: new Set(), levels: new Set() }
    bucket.games.add(row.gameId)
    if (row.accountLevel) bucket.levels.add(row.accountLevel)
    overlapByUid.set(row.uid, bucket)
  }

  const ranked = [...overlapByUid.entries()]
    .map(([uid, v]) => ({
      uid,
      userNum: uidToUserNum(uid),
      overlap: v.games.size,
      totalGameIds: gameIds.length,
      pmCount: 0,
      seasons: false,
      level: [...v.levels][0] ?? null,
    }))
    .sort((a, b) => b.overlap - a.overlap)

  for (const row of ranked.slice(0, 8)) {
    row.pmCount = await prisma.playerMatch.count({
      where: { uid: row.uid, apiSeasonId: API_SEASON, gameMode: 'rank' },
    })
    const s = await prisma.playerSeasonsCache.findUnique({ where: { id: `${row.uid}:1:11` } })
    row.seasons = s != null
  }

  return { nickname, gameIds: gameIds.length, ranked: ranked.slice(0, 8) }
}

try {
  for (const nick of USERS) {
    const result = await bestOverlapUid(nick)
    console.log(JSON.stringify(result, null, 2))
  }
} finally {
  await prisma.$disconnect()
}
