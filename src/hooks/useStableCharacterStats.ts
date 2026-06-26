import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  combatRichnessScore,
  buildCharacterStatsIdentityKey,
  isRichCharacterStatsSelection,
  pickRicherCharacterStatsSelection,
  provisionalCharacterStatsIdentityKey,
  resolveStableCharacterStatsSelection,
  shouldPersistCharacterStatsSnapshot,
} from '@/analysis/characterStatsStability'
import {
  evaluateStatsIdentityMatch,
  isStatsIdentityMatched,
} from '@/utils/profileOwnerGate'
import {
  selectProfileCharacterReports,
  type SelectProfileCharacterReportsInput,
  type SelectProfileCharacterReportsResult,
} from '@/analysis/profileCharacterStatsPriority'
import { shouldAllowLiveCharacterReports, shouldFreezeProfileSnapshot } from '@/utils/profileSnapshotPolicy'
import { traceCharacterStats } from '@/utils/characterStatsDebugTrace'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerMatchCharacterStatsMetaDTO } from '@/types/player'

const MAX_IDENTITY_SNAPSHOTS = 6

export interface UseStableCharacterStatsInput {
  nickname: string
  userNum: number
  seasonId: number
  navigationKey: string
  routeSummaryReady: boolean
  statsUserNum?: number | null
  statsQueryStatus: string
  statsFetchStatus: string
  statsDataUpdatedAt?: number
  playerMatchMeta?: PlayerMatchCharacterStatsMetaDTO | null
  officialRowCount: number
  playerMatchRowCount: number
  selectionInput: SelectProfileCharacterReportsInput
  manualRefreshActive: boolean
  isFirstCollect: boolean
  liveSnapshotUnlocked: boolean
}

export interface UseStableCharacterStatsResult {
  identityKey: string | null
  selection: SelectProfileCharacterReportsResult
  reports: CharacterAnalysisReport[]
  characterSnapshotFrozen: boolean
  pickReason: string
}

interface SnapshotEntry {
  selection: SelectProfileCharacterReportsResult
  persistedAt: number
  lastAccessedAt: number
  dataUpdatedAt: number
}

function sumGames(reports: CharacterAnalysisReport[]): number {
  return reports.reduce((sum, row) => sum + row.matchCount, 0)
}

function selectionSnapshotEquals(
  left: SelectProfileCharacterReportsResult,
  right: SelectProfileCharacterReportsResult,
): boolean {
  if (left.source !== right.source) return false
  if (left.reports.length !== right.reports.length) return false
  if (left.preferOfficialStatsDespitePartial !== right.preferOfficialStatsDespitePartial) return false
  return left.reports.every((row, index) => {
    const other = right.reports[index]
    if (!other) return false
    return (
      row.characterNum === other.characterNum &&
      row.matchCount === other.matchCount &&
      row.kda === other.kda &&
      row.avgKills === other.avgKills &&
      row.avgTeamKills === other.avgTeamKills &&
      row.avgDamageToPlayers === other.avgDamageToPlayers &&
      row.totalRpDelta === other.totalRpDelta
    )
  })
}

function buildSelectionSignature(selection: SelectProfileCharacterReportsResult): string {
  return [
    selection.source,
    selection.reports.length,
    combatRichnessScore(selection.reports),
    sumGames(selection.reports),
  ].join(':')
}

function pruneSnapshotStore(
  store: Record<string, SnapshotEntry>,
  activeKey: string | null,
): Record<string, SnapshotEntry> {
  const keys = Object.keys(store)
  if (keys.length <= MAX_IDENTITY_SNAPSHOTS) return store

  const next = { ...store }
  const evictionCandidates = keys
    .filter((key) => key !== activeKey)
    .sort((left, right) => next[left]!.lastAccessedAt - next[right]!.lastAccessedAt)

  for (const key of evictionCandidates) {
    delete next[key]
    if (Object.keys(next).length <= MAX_IDENTITY_SNAPSHOTS) break
  }
  return next
}

function migrateProvisionalSnapshot(
  store: Record<string, SnapshotEntry>,
  nickname: string,
  userNum: number,
  seasonId: number,
  now: number,
): Record<string, SnapshotEntry> {
  if (userNum <= 0) return store
  const provisionalKey = provisionalCharacterStatsIdentityKey(nickname, seasonId)
  const fullKey = buildCharacterStatsIdentityKey({
    nickname,
    userNum,
    seasonId,
    routeSummaryReady: true,
  })
  if (!provisionalKey || !fullKey || provisionalKey === fullKey) return store
  const provisional = store[provisionalKey]
  if (!provisional) return store
  const existing = store[fullKey]
  const mergedSelection = existing
    ? pickRicherCharacterStatsSelection(existing.selection, provisional.selection)
    : provisional.selection
  const next = { ...store }
  next[fullKey] = {
    selection: mergedSelection,
    persistedAt: existing?.persistedAt ?? provisional.persistedAt,
    lastAccessedAt: now > 0 ? now : Math.max(existing?.lastAccessedAt ?? 0, provisional.lastAccessedAt),
    dataUpdatedAt: Math.max(existing?.dataUpdatedAt ?? 0, provisional.dataUpdatedAt),
  }
  delete next[provisionalKey]
  return next
}

const EMPTY_CHARACTER_STATS_SELECTION: SelectProfileCharacterReportsResult = {
  reports: [],
  source: 'none',
  preferOfficialStatsDespitePartial: false,
}

export function useStableCharacterStats(
  input: UseStableCharacterStatsInput,
): UseStableCharacterStatsResult {
  const [stableByIdentity, setStableByIdentity] = useState<Record<string, SnapshotEntry>>({})
  const previousIdentityKeyRef = useRef<string | null>(null)
  const lastPersistedSignatureRef = useRef<string | null>(null)
  const navigationKeyRef = useRef(input.navigationKey)

  useLayoutEffect(() => {
    navigationKeyRef.current = input.navigationKey
  }, [input.navigationKey])

  const identityKey = buildCharacterStatsIdentityKey({
    nickname: input.nickname,
    userNum: input.userNum,
    seasonId: input.seasonId,
    routeSummaryReady: input.routeSummaryReady,
  })

  const migratedStableByIdentity = useMemo(
    () =>
      migrateProvisionalSnapshot(
        stableByIdentity,
        input.nickname,
        input.userNum,
        input.seasonId,
        0,
      ),
    [stableByIdentity, input.nickname, input.seasonId, input.userNum],
  )

  const stableSnapshot = useMemo(() => {
    if (identityKey == null) return null
    const entry = migratedStableByIdentity[identityKey]
    if (!entry) return null
    return entry.selection
  }, [identityKey, migratedStableByIdentity])

  const stableDataUpdatedAt = useMemo(() => {
    if (identityKey == null) return 0
    return migratedStableByIdentity[identityKey]?.dataUpdatedAt ?? 0
  }, [identityKey, migratedStableByIdentity])

  const identityMatchResult = evaluateStatsIdentityMatch(input.userNum, input.statsUserNum)
  const identityMatched = isStatsIdentityMatched(identityMatchResult)

  const incomingSelection = useMemo(() => {
    if (!input.routeSummaryReady || !identityMatched) {
      return EMPTY_CHARACTER_STATS_SELECTION
    }
    return selectProfileCharacterReports(input.selectionInput)
  }, [identityMatched, input.routeSummaryReady, input.selectionInput])

  const acceptContext = useMemo(
    () => ({
      incomingDataUpdatedAt: input.statsDataUpdatedAt ?? 0,
      stableDataUpdatedAt,
      playerMatchMetaStatus: input.playerMatchMeta?.status,
    }),
    [input.playerMatchMeta?.status, input.statsDataUpdatedAt, stableDataUpdatedAt],
  )

  const stableResolved = useMemo(
    () =>
      resolveStableCharacterStatsSelection({
        incoming: incomingSelection,
        stable: stableSnapshot,
        identityMatched,
        acceptContext,
      }),
    [acceptContext, incomingSelection, stableSnapshot, identityMatched],
  )

  const displayedStable = useMemo(
    () => stableSnapshot?.reports ?? [],
    [stableSnapshot],
  )

  const characterSnapshotFrozen = shouldFreezeProfileSnapshot({
    hasRichDisplayedSnapshot: isRichCharacterStatsSelection({
      reports: displayedStable,
      source: stableSnapshot?.source ?? 'none',
      preferOfficialStatsDespitePartial: false,
    }),
    isFirstCollect: input.isFirstCollect,
    manualRefreshActive: input.manualRefreshActive || input.liveSnapshotUnlocked,
  })

  const gatedSelection = useMemo(() => {
    const allowLive = shouldAllowLiveCharacterReports({
      frozen: characterSnapshotFrozen,
      displayed: displayedStable,
      incoming: stableResolved.selection.reports,
    })
    if (allowLive) return stableResolved.selection
    return stableSnapshot ?? stableResolved.selection
  }, [characterSnapshotFrozen, displayedStable, stableResolved.selection, stableSnapshot])

  const finalResolved = useMemo(
    () =>
      resolveStableCharacterStatsSelection({
        incoming: gatedSelection,
        stable: stableSnapshot,
        identityMatched,
        acceptContext,
      }),
    [acceptContext, gatedSelection, stableSnapshot, identityMatched],
  )

  const finalSelectionSignature = useMemo(
    () => buildSelectionSignature(finalResolved.selection),
    [finalResolved.selection],
  )

  useLayoutEffect(() => {
    if (identityKey !== previousIdentityKeyRef.current) {
      lastPersistedSignatureRef.current = null
    }
    if (identityKey !== previousIdentityKeyRef.current && identityKey != null) {
      if (previousIdentityKeyRef.current != null) {
        traceCharacterStats({
          name: 'profile-identity-changed',
          nickname: input.nickname,
          summaryUserNum: input.userNum,
          statsUserNum: input.statsUserNum ?? null,
          identityKey,
          queryStatus: input.statsQueryStatus,
          fetchStatus: input.statsFetchStatus,
          officialRowCount: input.officialRowCount,
          playerMatchRowCount: input.playerMatchRowCount,
          selectedSource: 'none',
          selectedRowCount: 0,
          finiteFieldCount: 0,
          reason: `${previousIdentityKeyRef.current} -> ${identityKey}`,
        })
      }
      previousIdentityKeyRef.current = identityKey
    }
  }, [
    identityKey,
    input.nickname,
    input.officialRowCount,
    input.playerMatchRowCount,
    input.statsFetchStatus,
    input.statsQueryStatus,
    input.statsUserNum,
    input.userNum,
  ])

  useLayoutEffect(() => {
    if (!identityKey || !shouldPersistCharacterStatsSnapshot(finalResolved.selection)) return
    if (input.navigationKey !== navigationKeyRef.current) return
    if (!identityMatched || !input.routeSummaryReady) return
    const signature = [identityKey, finalSelectionSignature].join(':')
    if (lastPersistedSignatureRef.current === signature) return

    const now = Date.now()
    setStableByIdentity((prev) => {
      const migrated = migrateProvisionalSnapshot(
        prev,
        input.nickname,
        input.userNum,
        input.seasonId,
        now,
      )
      const existing = migrated[identityKey]
      const nextSelection = existing
        ? pickRicherCharacterStatsSelection(existing.selection, finalResolved.selection)
        : finalResolved.selection
      if (existing && selectionSnapshotEquals(existing.selection, nextSelection)) {
        lastPersistedSignatureRef.current = signature
        if (existing.lastAccessedAt !== now) {
          return {
            ...migrated,
            [identityKey]: { ...existing, lastAccessedAt: now },
          }
        }
        return prev
      }
      const updated = pruneSnapshotStore(
        {
          ...migrated,
          [identityKey]: {
            selection: nextSelection,
            persistedAt: existing?.persistedAt ?? now,
            lastAccessedAt: now,
            dataUpdatedAt: input.statsDataUpdatedAt ?? now,
          },
        },
        identityKey,
      )
      lastPersistedSignatureRef.current = signature
      traceCharacterStats({
        name: 'character-stats-stashed',
        nickname: input.nickname,
        summaryUserNum: input.userNum,
        statsUserNum: input.statsUserNum ?? null,
        identityKey,
        queryStatus: input.statsQueryStatus,
        fetchStatus: input.statsFetchStatus,
        officialRowCount: input.officialRowCount,
        playerMatchRowCount: input.playerMatchRowCount,
        selectedSource: nextSelection.source,
        selectedRowCount: nextSelection.reports.length,
        finiteFieldCount: nextSelection.reports.filter((row) => Number.isFinite(row.kda)).length,
        reason: finalResolved.decision ?? finalResolved.pickReason,
      })
      return updated
    })
  }, [
    finalResolved.decision,
    finalResolved.pickReason,
    finalResolved.selection,
    finalSelectionSignature,
    identityKey,
    input.nickname,
    input.officialRowCount,
    input.playerMatchRowCount,
    input.seasonId,
    input.statsDataUpdatedAt,
    input.statsFetchStatus,
    input.statsQueryStatus,
    input.statsUserNum,
    input.userNum,
    input.navigationKey,
    input.routeSummaryReady,
    identityMatched,
  ])

  const ownerDisplayReady = input.routeSummaryReady && identityMatched
  const displayedSelection = ownerDisplayReady
    ? finalResolved.selection
    : EMPTY_CHARACTER_STATS_SELECTION

  const traceSnapshot = useMemo(
    () => ({
      pickReason: finalResolved.pickReason,
      reason: finalResolved.decision ?? finalResolved.pickReason,
      source: finalResolved.selection.source,
      rowCount: finalResolved.selection.reports.length,
      finiteFieldCount: finalResolved.selection.reports.filter((row) =>
        Number.isFinite(row.kda),
      ).length,
    }),
    [finalResolved],
  )

  useLayoutEffect(() => {
    traceCharacterStats({
      name:
        traceSnapshot.pickReason === 'stable'
          ? 'character-stats-restored'
          : 'character-source-selected',
      nickname: input.nickname,
      summaryUserNum: input.userNum,
      statsUserNum: input.statsUserNum ?? null,
      identityKey,
      queryStatus: input.statsQueryStatus,
      fetchStatus: input.statsFetchStatus,
      officialRowCount: input.officialRowCount,
      playerMatchRowCount: input.playerMatchRowCount,
      selectedSource: traceSnapshot.source,
      selectedRowCount: traceSnapshot.rowCount,
      finiteFieldCount: traceSnapshot.finiteFieldCount,
      reason: traceSnapshot.reason,
    })
  }, [
    identityKey,
    input.nickname,
    input.officialRowCount,
    input.playerMatchRowCount,
    input.statsFetchStatus,
    input.statsQueryStatus,
    input.statsUserNum,
    input.userNum,
    traceSnapshot,
  ])

  return {
    identityKey,
    selection: displayedSelection,
    reports: displayedSelection.reports,
    characterSnapshotFrozen,
    pickReason: ownerDisplayReady ? finalResolved.pickReason : 'identity-mismatch',
  }
}
