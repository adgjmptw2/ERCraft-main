import { PrismaClient } from '@prisma/client'

const API_SEASON = 39
const USERS = ['하잉', '연서', '절단마술사']

const prisma = new PrismaClient()

function squadFromStats(data) {
  if (!Array.isArray(data)) return null
  return data.find((r) => r.matchingTeamMode === 3) ?? data[0] ?? null
}

async function probeNickname(nickname) {
  console.log(`\n========== ${nickname} ==========`)

  const bindings = await prisma.$queryRaw`
    SELECT normalized_nickname, canonical_uid FROM profile_nickname_bindings
    WHERE normalized_nickname = ${nickname.trim().toLowerCase()}`
  console.log('binding', bindings)

  const participants = await prisma.matchParticipant.findMany({
    where: { nickname },
    select: { uid: true, gameId: true, nickname: true },
    take: 20,
  })
  console.log('participants count', participants.length, participants.slice(0, 5))

  const participantGameIds = [...new Set(participants.map((p) => p.gameId).filter(Boolean))]
  if (participantGameIds.length > 0) {
    const pmByGame = await prisma.playerMatch.findMany({
      where: { gameId: { in: participantGameIds.slice(0, 16) }, gameMode: 'rank' },
      select: { uid: true, gameId: true, accountLevel: true, rpAfter: true },
      take: 32,
    })
    const byUid = new Map()
    for (const row of pmByGame) {
      const bucket = byUid.get(row.uid) ?? new Set()
      bucket.add(row.gameId)
      byUid.set(row.uid, bucket)
    }
    console.log(
      'pm uids from participant gameIds',
      [...byUid.entries()].map(([uid, games]) => ({ uid: uid.slice(0, 28), overlap: games.size })),
    )
  }

  const statsRows = await prisma.seasonStatsCache.findMany({
    where: { id: { endsWith: `:${API_SEASON}` } },
    select: { id: true, data: true },
    take: 1000,
  })
  const nickStats = statsRows.filter((r) => JSON.stringify(r.data).includes(nickname))
  console.log(
    'seasonStatsCache hits',
    nickStats.length,
    nickStats.slice(0, 5).map((r) => {
      const uid = r.id.slice(0, r.id.lastIndexOf(':'))
      const squad = squadFromStats(r.data)
      return { uid: uid.slice(0, 28), games: squad?.totalGames, mmr: squad?.mmr }
    }),
  )

  for (const row of nickStats.slice(0, 2)) {
    const uid = row.id.slice(0, row.id.lastIndexOf(':'))
    const pmCount = await prisma.playerMatch.count({ where: { uid, apiSeasonId: API_SEASON, gameMode: 'rank' } })
    const seasonsRow = await prisma.playerSeasonsCache.findUnique({ where: { id: `${uid}:1:11` } })
    const matchesRow = await prisma.matchesCache.findUnique({ where: { id: `${uid}:0` } })
    const matchesData = matchesRow?.data
    const matchItems = Array.isArray(matchesData) ? matchesData : []
    console.log('uid detail', {
      uid: uid.slice(0, 32),
      pmCount,
      hasSeasons: seasonsRow != null,
      matchesCacheItems: matchItems.length,
    })
    if (matchItems.length > 0) {
      const gameIds = matchItems.slice(0, 10).map((i) => i.matchId).filter(Boolean)
      const overlap = await prisma.playerMatch.groupBy({
        by: ['uid'],
        where: { gameId: { in: gameIds }, gameMode: 'rank', apiSeasonId: API_SEASON },
        _count: { gameId: true },
      })
      console.log(
        'matchesCache gameIds overlap by uid',
        overlap.map((o) => ({ uid: o.uid.slice(0, 28), overlap: o._count.gameId })),
      )
    }
  }

  const matchCaches = await prisma.$queryRaw`
    SELECT id FROM matches_cache WHERE CAST(data AS CHAR) LIKE ${'%' + nickname + '%'} LIMIT 10`
  console.log('matchesCache ids with nickname', matchCaches)
}

try {
  for (const nick of USERS) await probeNickname(nick)
} finally {
  await prisma.$disconnect()
}
