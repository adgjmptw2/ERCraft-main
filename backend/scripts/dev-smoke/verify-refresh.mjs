const API = 'http://127.0.0.1:3001/api'
for (const nick of ['마인', '하잉']) {
  const refresh = await fetch(`${API}/players/${encodeURIComponent(nick)}/matches?matchMode=cobalt&page=0&pageSize=3&refresh=true`)
  const body = await refresh.json()
  console.log('===', nick, 'refresh ===')
  console.log('meta', body.profileRefresh?.latestGameIdAfter, 'inserted', body.profileRefresh?.newGamesInserted)
  for (const item of body?.data?.items ?? []) {
    console.log(item.matchId, 'userNum', item.userNum, 'char', item.characterNum, item.characterName)
  }
}