import "dotenv/config"
import { BserClient } from "../src/external/bserClient.js"
import { loadSeasonCatalog } from "../src/external/seasonCatalog.js"

const client = new BserClient(process.env.BSER_API_KEY)
const catalog = await loadSeasonCatalog(client)
const apiSeason = catalog.currentApiSeasonId()
console.log("apiSeason", apiSeason)
for (const nick of ["찬형", "절단마술사"]) {
  const users = await client.searchUser(nick)
  const u = users[0]
  if (!u) { console.log(nick, "not found"); continue }
  const rank = await client.getUserRank(u.uid, apiSeason)
  console.log("===", nick, "===")
  console.log(JSON.stringify(rank, null, 2))
}
