import { useLayoutEffect, useRef } from 'react'

import { traceProfileIdentityHandoff } from '@/utils/profileIdentityHandoffTrace'

export interface ProfileIdentityHandoffTraceInput {
  navigationKey: string
  profileIdentityPhase: string
  routeNickname: string
  routeSummaryReady: boolean
  summaryQueryKey: readonly unknown[]
  summaryQueryStatus: string
  summaryFetchStatus: string
  summaryDataNickname: string | null
  summaryUserNum: number | null
  statsQueryKey: readonly unknown[]
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
}

function queryKeyLabel(key: readonly unknown[]): string {
  return JSON.stringify(key)
}

function buildTracePayload(input: ProfileIdentityHandoffTraceInput, normalized: string) {
  return {
    navigationKey: input.navigationKey,
    profileIdentityPhase: input.profileIdentityPhase,
    routeNicknameRaw: input.routeNickname,
    routeNicknameNormalized: normalized,
    summaryQueryKey: queryKeyLabel(input.summaryQueryKey),
    summaryQueryStatus: input.summaryQueryStatus,
    summaryFetchStatus: input.summaryFetchStatus,
    summaryDataNickname: input.summaryDataNickname,
    summaryUserNum: input.summaryUserNum,
    statsQueryKey: queryKeyLabel(input.statsQueryKey),
    statsQueryStatus: input.statsQueryStatus,
    statsFetchStatus: input.statsFetchStatus,
    statsResponseUserNum: input.statsResponseUserNum,
    payloadOwnerUserNum: input.payloadOwnerUserNum,
    ownerGateResult: input.ownerGateResult,
    statsSelectedIdentityKey: input.statsSelectedIdentityKey,
    stableSnapshotIdentityKey: input.stableSnapshotIdentityKey,
    stableSelectionSource: input.stableSelectionSource,
    stableFirstCharacter: input.stableFirstCharacter,
    seasonsQueryKey: input.seasonsQueryKey,
    seasonsQueryEnabled: input.seasonsQueryEnabled,
    seasonsRequestedRange: input.seasonsRequestedRange,
    seasonsRowCount: input.seasonsRowCount,
    seasonsState: input.seasonsState,
    displayedSeasonChips: input.displayedSeasonChips,
    displayedOwner: input.displayedOwner,
    renderedProfileOwner: input.renderedProfileOwner,
  }
}

export function useProfileIdentityHandoffTrace(input: ProfileIdentityHandoffTraceInput): void {
  const previousNicknameRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return

    const normalized = input.routeNickname.trim().toLowerCase()
    const previous = previousNicknameRef.current
    const payload = buildTracePayload(input, normalized)

    if (previous !== null && previous !== normalized) {
      traceProfileIdentityHandoff({
        name: 'route-nickname-changed',
        ...payload,
        reason: `${previous} -> ${normalized}`,
      })
    }
    previousNicknameRef.current = normalized

    traceProfileIdentityHandoff({
      name: 'profile-render-owner',
      ...payload,
      reason: input.routeSummaryReady ? 'route-summary-ready' : 'route-summary-pending',
    })

    if (input.statsFetchStatus === 'fetching') {
      traceProfileIdentityHandoff({
        name: 'stats-query-start',
        ...payload,
        reason: 'stats-fetching',
      })
    }

    if (!input.seasonsQueryEnabled) {
      traceProfileIdentityHandoff({
        name: 'seasons-query-skipped',
        ...payload,
        reason: 'seasons-disabled',
      })
    }
  }, [
    input,
    input.navigationKey,
    input.profileIdentityPhase,
    input.routeNickname,
    input.routeSummaryReady,
    input.summaryQueryKey,
    input.summaryQueryStatus,
    input.summaryFetchStatus,
    input.summaryDataNickname,
    input.summaryUserNum,
    input.statsQueryKey,
    input.statsQueryStatus,
    input.statsFetchStatus,
    input.statsResponseUserNum,
    input.payloadOwnerUserNum,
    input.ownerGateResult,
    input.statsSelectedIdentityKey,
    input.stableSnapshotIdentityKey,
    input.stableSelectionSource,
    input.stableFirstCharacter,
    input.seasonsQueryKey,
    input.seasonsQueryEnabled,
    input.seasonsRequestedRange,
    input.seasonsRowCount,
    input.seasonsState,
    input.displayedSeasonChips,
    input.displayedOwner,
    input.renderedProfileOwner,
  ])
}
