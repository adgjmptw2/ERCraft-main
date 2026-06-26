import { PrismaClient } from '@prisma/client'

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001/api'
const USERS = process.argv.slice(2)
if (USERS.length === 0) {
  console.error('Usage: node cold-profile-verify.mjs <nickname> [...]')
  process.exit(1)
}

const prisma = new PrismaClient()

async function timedFetch(path) {
  const started = performance.now()
  const res = await fetch(`${BASE}${path}`)
  const ms = Math.round(performance.now() - started)
  const json = await res.json()
  return { path, ms, status: res.status, source: json.source, data: json.data }
}

async function verifyNickname(nickname) {
  const encoded = encodeURIComponent(nickname)
  console.log(`\n===== ${nickname} =====`)

  const binding = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname: nickname.trim().toLowerCase() },
  })
  const aliases = binding
    ? await prisma.profileIdentityAlias.findMany({
        where: { canonicalUid: binding.canonicalUid, isActive: true },
      })
    : []
  console.log('binding', binding?.canonicalUid ?? null)
  console.log(
    'aliases',
    aliases.map((row) => ({ sourceUid: row.sourceUid.slice(0, 24), method: row.verificationMethod })),
  )

  const summary = await timedFetch(`/players/${encoded}/summary`)
  const stats = await timedFetch(`/players/${encoded}/stats`)
  const seasons = await timedFetch(`/players/${encoded}/seasons?from=1&to=11`)
  const matches = await timedFetch(`/players/${encoded}/matches?page=0&pageSize=10`)

  for (const row of [summary, stats, seasons, matches]) {
    console.log(row.path, { ms: row.ms, status: row.status, source: row.source })
  }

  const bindingAfter = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname: nickname.trim().toLowerCase() },
  })
  const aliasesAfter = bindingAfter
    ? await prisma.profileIdentityAlias.findMany({
        where: { canonicalUid: bindingAfter.canonicalUid, isActive: true },
      })
    : []
  console.log('binding after requests', bindingAfter?.canonicalUid?.slice(0, 32) ?? null)
  console.log('aliases after', aliasesAfter.length)

  const pmStats = stats.data?.playerMatchCharacterStats ?? []
  const pmMeta = stats.data?.playerMatchCharacterStatsMeta
  console.log('rich stats', {
    rowCount: pmStats.length,
    metaStatus: pmMeta?.status,
    matchCount: pmMeta?.matchCount,
    sample: pmStats[0]
      ? {
          tk: pmStats[0].teamKills,
          kda: pmStats[0].kda,
          damage: pmStats[0].damageToPlayer,
        }
      : null,
  })
  console.log('seasons played count', seasons.data?.seasons?.filter((s) => s.played)?.length ?? 0)
}

try {
  for (const nickname of USERS) {
    await verifyNickname(nickname)
  }
} finally {
  await prisma.$disconnect()
}
