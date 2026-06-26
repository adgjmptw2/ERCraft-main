import "dotenv/config"
import { BserClient } from "../src/external/bserClient.js"

const client = new BserClient(process.env.BSER_API_KEY)
const search = await client.searchUser("하잉")
const uid = search?.userId
console.log("uid", uid?.slice(0,30), "userNum", search?.userNum)
const page = await client.getUserGames(uid)
const games = page.games.slice(0, 15).map(g => ({ gameId: String(g.gameId), matchingMode: g.matchingMode, seasonId: g.seasonId, started: g.startDtm }))
console.log("first15", JSON.stringify(games, null, 2))
const rankFirst = page.games.find(g => g.matchingMode === 3 || g.matchingMode === 1)
console.log("first rank-like", rankFirst ? String(rankFirst.gameId) : null)
await client.close?.()
