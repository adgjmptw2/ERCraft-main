const MINE_UID = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const HAYING_UID = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'

async function fetchMatches(nick, mode) {
  const url = `http://127.0.0.1:3001/api/players/${encodeURIComponent(nick)}/matches?page=0&pageSize=50&mode=${mode}`
  const res = await fetch(url)
  return res.json()
}

async function main() {
  const mine = await fetchMatches('마인', 'cobalt')
  const haying = await fetchMatches('하잉', 'cobalt')
  const mineItems = mine.data?.items ?? []
  const hayingItems = haying.data?.items ?? []
  const shared = mineItems.map((i) => i.matchId).filter((g) => hayingItems.some((h) => h.matchId === g))
  const mismatches = []
  for (const gameId of shared) {
    const m = mineItems.find((i) => i.matchId === gameId)
    const h = hayingItems.find((i) => i.matchId === gameId)
    if (m.characterNum === h.characterNum && m.kills === h.kills && m.deaths === h.deaths) {
      mismatches.push({ gameId, mine: { userNum: m.userNum, char: m.characterNum, kills: m.kills }, haying: { userNum: h.userNum, char: h.characterNum, kills: h.kills } })
    }
  }
  console.log(JSON.stringify({
    mineCount: mineItems.length,
    hayingCount: hayingItems.length,
    shared: shared.length,
    identicalStatsOnShared: mismatches.length,
    mineUserNums: [...new Set(mineItems.map((i) => i.userNum))],
    hayingUserNums: [...new Set(hayingItems.map((i) => i.userNum))],
    samples: mismatches.slice(0, 5),
    mineFirst: mineItems[0] ? { gameId: mineItems[0].matchId, userNum: mineItems[0].userNum, char: mineItems[0].characterNum, kills: mineItems[0].kills } : null,
    hayingFirst: hayingItems[0] ? { gameId: hayingItems[0].matchId, userNum: hayingItems[0].userNum, char: hayingItems[0].characterNum, kills: hayingItems[0].kills } : null,
  }, null, 2))
}
main()