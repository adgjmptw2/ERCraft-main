import { writeFileSync } from "node:fs"

const peek = `export const DEFAULT_ENTRY_PEEK_TTL_MS = 90_000

type PeekRow = { verifiedAt: number; dbGameId: string | null; upstreamGameId: string | null }

const entryPeekVerified = new Map<string, PeekRow>()

export function resetProfileEntryPeekCacheForTests(): void {
  entryPeekVerified.clear()
}

function resolveEntryPeekTtlMs(): number {
  const raw = process.env.PROFILE_ENTRY_PEEK_TTL_MS
  if (raw === undefined || raw.trim() === "") return DEFAULT_ENTRY_PEEK_TTL_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 30_000 ? parsed : DEFAULT_ENTRY_PEEK_TTL_MS
}

export function readEntryPeekVerified(
  canonicalUid: string,
  now: Date,
): { dbGameId: string | null; upstreamGameId: string | null } | null {
  const row = entryPeekVerified.get(canonicalUid)
  if (!row) return null
  if (now.getTime() - row.verifiedAt >= resolveEntryPeekTtlMs()) return null
  return { dbGameId: row.dbGameId, upstreamGameId: row.upstreamGameId }
}

export function rememberEntryPeekVerified(
  canonicalUid: string,
  dbGameId: string | null,
  upstreamGameId: string | null,
  now: Date,
): void {
  entryPeekVerified.set(canonicalUid, {
    verifiedAt: now.getTime(),
    dbGameId,
    upstreamGameId,
  })
}

export function wasEntryRecentlyVerifiedFresh(canonicalUid: string, now: Date): boolean {
  return readEntryPeekVerified(canonicalUid, now) != null
}
`

writeFileSync("backend/src/cache/profileEntryPeekCache.ts", peek, "utf8")
