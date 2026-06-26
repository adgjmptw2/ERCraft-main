const MAX_TRACE_ENTRIES = 128

export interface ProfileReadTraceEntry {
  at: string
  event: string
  nickname?: string
  uid?: string
  from?: number
  to?: number
  seasonCount?: number
  source?: string
  identityStatus?: string
  playerMatchUidCount?: number
  rawMatchCount?: number
  dedupMatchCount?: number
}

const ring: ProfileReadTraceEntry[] = []

function isDevEnv(): boolean {
  return process.env.NODE_ENV === 'development'
}

export function traceProfileRead(entry: Omit<ProfileReadTraceEntry, 'at'>): void {
  if (!isDevEnv()) return
  ring.push({ ...entry, at: new Date().toISOString() })
  if (ring.length > MAX_TRACE_ENTRIES) ring.shift()
}

export function getProfileReadTraceSnapshot(): readonly ProfileReadTraceEntry[] {
  return ring
}

export function clearProfileReadTraceForTests(): void {
  ring.length = 0
}
