import { PrismaClient } from "@prisma/client"
const p = new PrismaClient()
const g = await p.playerMatch.findMany({ where: { gameId: "61903531" }, select: { uid: true, gameId: true, gameMode: true, apiSeasonId: true, playedAt: true } })
console.log("game 61903531", JSON.stringify(g))
const parts = await p.matchParticipant.findMany({ where: { nickname: "하잉" }, take: 1, select: { uid: true } })
const uid = parts[0]?.uid
if (uid) {
  const latest = await p.playerMatch.findFirst({ where: { uid }, orderBy: [{ playedAt: "desc" }, { gameId: "desc" }], select: { gameId: true, gameMode: true } })
  const rankLatest = await p.playerMatch.findFirst({ where: { uid, gameMode: "rank" }, orderBy: [{ playedAt: "desc" }, { gameId: "desc" }], select: { gameId: true } })
  console.log("uid", uid.slice(0,30), "latest", latest, "rankLatest", rankLatest)
}
await p.$disconnect()
