const API = 'http://127.0.0.1:3001/api'
for (const nick of ['마인', '하잉']) {
  const res = await fetch(`${API}/players/${encodeURIComponent(nick)}/matches?matchMode=cobalt&page=0&pageSize=5`)
  const body = await res.json()
  console.log('===', nick, 'status', res.status, '===')
  for (const item of body?.data?.items ?? []) {
    console.log(item.matchId, 'userNum', item.userNum, 'char', item.characterNum, item.characterName)
  }
}
const gid = '61930778'
for (const nick of ['마인', '하잉']) {
  const res = await fetch(`${API}/players/${encodeURIComponent(nick)}/matches?matchMode=cobalt&page=0&pageSize=50`)
  const hit = ((await res.json())?.data?.items ?? []).find(i => i.matchId === gid)
  console.log(nick, 'shared', gid, hit ? { userNum: hit.userNum, char: hit.characterNum, name: hit.characterName, kills: hit.kills } : 'missing')
}