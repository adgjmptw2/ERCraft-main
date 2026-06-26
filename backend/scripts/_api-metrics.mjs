async function identity(nick) {
  const res = await fetch(`http://127.0.0.1:3001/api/players/${encodeURIComponent(nick)}/summary`)
  const body = await res.json()
  const m = await fetch(`http://127.0.0.1:3001/api/players/${encodeURIComponent(nick)}/matches?page=0&pageSize=3&mode=cobalt`)
  const mb = await m.json()
  return {
    nick,
    summaryUserNum: body.data?.userNum,
    metrics: mb.metrics ?? mb._metrics,
    source: mb.source,
    itemCount: mb.data?.items?.length,
    firstGame: mb.data?.items?.[0]?.matchId,
  }
}
const out = await Promise.all([identity('마인'), identity('하잉')])
console.log(JSON.stringify(out, null, 2))