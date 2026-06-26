import { writeFileSync } from "node:fs"

const peek = `/** profile entry peek cache */
export const DEFAULT_ENTRY_PEEK_TTL_MS = 90_000

const entryPeekVerified = new Map()

export function resetProfileEntryPeekCacheForTests() {
  entryPeekVerified.clear()
}

function resolveEntryPeekTtlMs() {
  const raw = process.env.PROFILE_ENTRY_PEEK_TTL_MS
  if (raw === undefined || raw.trim() === "") return DEFAULT_ENTRY_PEEK_TTL_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 30_000 ? parsed : DEFAULT_ENTRY_PEEK_TTL_MS
}

export function readEntryPeekVerified(canonicalUid, now) {
  const row = entryPeekVerified.get(canonicalUid)
  if (!row) return null
  if (now.getTime() - row.verifiedAt >= resolveEntryPeekTtlMs()) return null
  return { dbGameId: row.dbGameId, upstreamGameId: row.upstreamGameId }
}

export function rememberEntryPeekVerified(canonicalUid, dbGameId, upstreamGameId, now) {
  entryPeekVerified.set(canonicalUid, {
    verifiedAt: now.getTime(),
    dbGameId,
    upstreamGameId,
  })
}

export function wasEntryRecentlyVerifiedFresh(canonicalUid, now) {
  return readEntryPeekVerified(canonicalUid, now) != null
}
`

writeFileSync("backend/src/cache/profileEntryPeekCache.ts", peek, "utf8")
console.log("peek ok")
