const API = 'http://localhost:3001/api'
const gid = '61930778'
for (const nick of ['마인', '하잉']) {
  const res = await fetch(`${API}/players/${encodeURIComponent(nick)}/matches?matchMode=cobalt&page=0&pageSize=50`)
  const items = (await res.json())?.data?.items ?? []
  const hit = items.find((i) => i.matchId === gid)
  console.log(nick, hit ? { userNum: hit.userNum, char: hit.characterNum, name: hit.characterName, kills: hit.kills } : 'not found in', items.length, 'items')
}