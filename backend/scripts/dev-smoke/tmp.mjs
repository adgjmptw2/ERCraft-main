const API = 'http://127.0.0.1:3001/api'
const res = await fetch(`${API}/players/${encodeURIComponent('하잉')}/matches?matchMode=cobalt&page=0&pageSize=5`)
const text = await res.text()
console.log('status', res.status, 'len', text.length)
console.log(text.slice(0, 800))