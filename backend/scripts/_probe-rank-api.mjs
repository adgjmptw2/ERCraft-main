import "dotenv/config"
import { BserClient } from "../dist/external/bserClient.js"
import { loadSeasonCatalog } from "../dist/external/seasonCatalog.js"

const client = new BserClient(process.env.BSER_API_KEY)
const catalog = await loadSeasonCatalog(client)
const apiSeason = catalog.currentApiSeasonId()
console.log("apiSeason", apiSeason)
for (const nick of ["찬형", "절단마술사"]) {
  const users = await client.searchUser(nick)
  const u = users[0]
  if (!u) { console.log(nick, "not found"); continue }
  const rank = await client.getUserRank(u.uid, apiSeason)
  const stats = await client.getUserStats(u.uid, apiSeason)
  const squad = stats.find(s => s.matchingTeamMode === 3) ?? stats[0]
  console.log("===", nick, "===")
  console.log("rankApi", rank)
  console.log("squadStat", squad ? { mmr: squad.mmr, rank: squad.rank, rankSize: squad.rankSize } : null)
}