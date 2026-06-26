export type ProfileIdentityHandoffEventName =
  | 'route-nickname-changed'
  | 'summary-query-start'
  | 'summary-query-data'
  | 'stats-query-start'
  | 'stats-query-data'
  | 'stable-stats-selected'
  | 'stable-stats-rejected'
  | 'seasons-query-start'
  | 'seasons-query-skipped'
  | 'seasons-query-data'
  | 'profile-render-owner'

export interface ProfileIdentityHandoffEvent {
  timestamp: number
  name: ProfileIdentityHandoffEventName
  routeNicknameRaw: string
  routeNicknameNormalized: string
  previousRouteNickname: string | null
  navigationKey: string
  profileIdentityPhase: string
  summaryQueryKey: string
  summaryQueryStatus: string
  summaryFetchStatus: string
  summaryDataNickname: string | null
  summaryUserNum: number | null
  statsQueryKey: string
  statsQueryStatus: string
  statsFetchStatus: string
  statsResponseUserNum: number | null
  payloadOwnerUserNum: number | null
  ownerGateResult: string
  statsSelectedIdentityKey: string | null
  stableSnapshotIdentityKey: string | null
  stableSelectionSource: string
  stableFirstCharacter: string | null
  seasonsQueryKey: string
  seasonsQueryEnabled: boolean
  seasonsRequestedRange: string
  seasonsRowCount: number
  seasonsState: string
  displayedSeasonChips: string
  displayedOwner: string
  renderedProfileOwner: string
  reason: string
}

const BUFFER_SIZE = 64
const buffer: ProfileIdentityHandoffEvent[] = []
let previousRouteNickname: string | null = null

export function traceProfileIdentityHandoff(
  event: Omit<ProfileIdentityHandoffEvent, 'timestamp' | 'previousRouteNickname'> & {
    previousRouteNickname?: string | null
  },
): void {
  if (!import.meta.env.DEV) return
  const prev =
    event.previousRouteNickname !== undefined
      ? event.previousRouteNickname
      : previousRouteNickname
  if (event.name === 'route-nickname-changed') {
    previousRouteNickname = event.routeNicknameNormalized
  }
  buffer.push({
    ...event,
    previousRouteNickname: prev,
    timestamp: Date.now(),
  })
  if (buffer.length > BUFFER_SIZE) {
    buffer.splice(0, buffer.length - BUFFER_SIZE)
  }
}

export function readProfileIdentityHandoffTrace(): readonly ProfileIdentityHandoffEvent[] {
  return buffer
}

export function clearProfileIdentityHandoffTrace(): void {
  buffer.length = 0
  previousRouteNickname = null
}

export function resetProfileIdentityHandoffRouteTracking(): void {
  previousRouteNickname = null
}
