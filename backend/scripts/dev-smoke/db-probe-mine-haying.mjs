import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const API = 'http://localhost:3001/api'
const UIDS = ['mByXQq5l_Q6VKeuws_Y1', '-Ewhk-EsVDWNR_M0CE-7']

// get full uids
const rows = await prisma.playerMatch.findMany({
  where: { gameId: '61930778' },
  select: { uid: true, characterNum: true, characterName: true, kills: true, rawJson: true }
})
for (const r of rows) {
  const raw = r.rawJson
  const nick = raw?.nickname ?? raw?.playerNickname
  const uid = raw?.uid ?? raw?.userId
  console.log('ownerUid', r.uid)
  console.log('  char', r.characterNum, r.characterName, 'kills', r.kills)
  console.log('  raw nick', nick, 'raw uid', uid)
}

// profile identity via nickname binding
const bindings = await prisma.profileNicknameBinding.findMany({
  where: { nickname: { in: ['마인', '하잉'] } },
}).catch(() => [])
console.log('bindings', bindings)

const aliases = await prisma.profileIdentityAlias.findMany({
  take: 20,
  where: { OR: [{ canonicalUid: { in: rows.map(r=>r.uid) } }, { sourceUid: { in: rows.map(r=>r.uid) } }] }
}).catch(() => [])
console.log('aliases sample', aliases)

// check playerMatchUids via API internal - resolve summary + matches with debug
for (const nick of ['마인', '하잉']) {
  const rank = await fetch(`${API}/players/${encodeURIComponent(nick)}/matches?matchMode=rank&page=0&pageSize=1`)
  const item = (await rank.json())?.data?.items?.[0]
  const cobalt = await fetch(`${API}/players/${encodeURIComponent(nick)}/matches?matchMode=cobalt&page=0&pageSize=1`)
  const citem = (await cobalt.json())?.data?.items?.[0]
  console.log(nick, 'rank top', item?.matchId, 'char', item?.characterNum, item?.characterName, 'userNum', item?.userNum)
  console.log(nick, 'cobalt top', citem?.matchId, 'char', citem?.characterNum, citem?.characterName, 'userNum', citem?.userNum)
}

await prisma.$disconnect()