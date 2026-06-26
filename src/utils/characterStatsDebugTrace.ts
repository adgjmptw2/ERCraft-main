export type CharacterStatsTraceEventName =
  | 'character-source-selected'
  | 'character-source-rejected'
  | 'character-stats-stashed'
  | 'character-stats-restored'
  | 'profile-identity-changed'

export interface CharacterStatsTraceEvent {
  timestamp: number
  name: CharacterStatsTraceEventName
  nickname: string
  summaryUserNum: number
  statsUserNum: number | null
  identityKey: string | null
  queryStatus: string
  fetchStatus: string
  officialRowCount: number
  playerMatchRowCount: number
  selectedSource: string
  selectedRowCount: number
  finiteFieldCount: number
  reason: string
}

const BUFFER_SIZE = 48
const buffer: CharacterStatsTraceEvent[] = []

export function traceCharacterStats(
  event: Omit<CharacterStatsTraceEvent, 'timestamp'>,
): void {
  if (!import.meta.env.DEV) return
  buffer.push({ ...event, timestamp: Date.now() })
  if (buffer.length > BUFFER_SIZE) {
    buffer.splice(0, buffer.length - BUFFER_SIZE)
  }
}

export function readCharacterStatsDebugTrace(): readonly CharacterStatsTraceEvent[] {
  return buffer
}

export function clearCharacterStatsDebugTrace(): void {
  buffer.length = 0
}
