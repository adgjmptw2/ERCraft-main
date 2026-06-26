import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { fetchPlayerByNickname, fetchProfileEntryFreshness } from '@/api/player'
import { isRealMode } from '@/api/erClient'
import type { ProfileEntryFreshnessResult } from '@/types/api'
import type { MatchHistoryMode } from '@/types/matchMode'
import { assertSummaryWriteIdentity } from '@/utils/profileCacheWriteGuard'
import {
  normalizePlayerNickname,
  playerQueryKeys,
  playerQueryOwnerScope,
  type PlayerDataSource,
  type PlayerQueryOwnerScope,
} from '@/utils/playerQueryKeys'

export type ProfileEntryFreshnessPhase =
  | 'idle'
  | 'checking'
  | 'updated'
  | 'no-change'
  | 'upstream-stale'
  | 'failed'

export interface UseProfileEntryFreshnessOptions {
  enabled: boolean
  nickname: string
  navigationKey: string
  seasonId?: number
  userNum?: number
  dataSource?: PlayerDataSource
  ownerScope?: PlayerQueryOwnerScope
  matchMode?: MatchHistoryMode
  manualRefreshActive: boolean
  entryFreshnessSuppressed?: boolean
}

export interface UseProfileEntryFreshnessResult {
  phase: ProfileEntryFreshnessPhase
  lastResult: ProfileEntryFreshnessResult | null
}

function resolvePhase(result: ProfileEntryFreshnessResult): ProfileEntryFreshnessPhase {
  if (result.status === 'collected' || result.matchesUpdated || result.newGamesInserted > 0) {
    return 'updated'
  }
  if (result.status === 'upstream-game-list-stale') return 'upstream-stale'
  if (result.status === 'failed') return 'failed'
  if (result.status === 'already-fresh' || result.status === 'skipped-inflight') return 'no-change'
  return 'no-change'
}

export function useProfileEntryFreshness(
  options: UseProfileEntryFreshnessOptions,
): UseProfileEntryFreshnessResult {
  const queryClient = useQueryClient()
  const term = normalizePlayerNickname(options.nickname)
  const dataSource = options.dataSource ?? (isRealMode() ? 'real' : 'demo')
  const [phase, setPhase] = useState<ProfileEntryFreshnessPhase>('idle')
  const [lastResult, setLastResult] = useState<ProfileEntryFreshnessResult | null>(null)
  const ranForNavigationRef = useRef<string | null>(null)

  useEffect(() => {
    if (
      !options.enabled ||
      !isRealMode() ||
      term.length === 0 ||
      options.manualRefreshActive ||
      options.entryFreshnessSuppressed
    ) {
      setPhase('idle')
      return
    }

    const navKey = `${options.navigationKey}:${term}`
    if (ranForNavigationRef.current === navKey) return
    ranForNavigationRef.current = navKey

    const summaryPendingScope = playerQueryOwnerScope({ nickname: term, dataSource })
    const ownerScope =
      options.ownerScope ??
      playerQueryOwnerScope({
        nickname: term,
        dataSource,
        userNum: options.userNum,
      })
    const baselineNavigationKey = options.navigationKey

    let cancelled = false
    setPhase('checking')

    const invalidateProfileQueries = async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: playerQueryKeys.matchesDtoPrefix(ownerScope),
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: playerQueryKeys.statsDtoPrefix(ownerScope),
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: playerQueryKeys.seasonsPrefix(ownerScope),
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: playerQueryKeys.summary(summaryPendingScope),
          refetchType: 'active',
        }),
      ])
    }

    const run = async () => {
      try {
        const res = await fetchProfileEntryFreshness(term, {
          userNum: options.userNum,
          seasonId: options.seasonId,
        })
        if (cancelled || options.navigationKey !== baselineNavigationKey) return
        setLastResult(res.data)
        const nextPhase = resolvePhase(res.data)
        if (nextPhase === 'updated') {
          await invalidateProfileQueries()
        } else {
          await queryClient.invalidateQueries({
            queryKey: playerQueryKeys.matchesDtoPrefix(ownerScope),
            refetchType: 'active',
          })
          if (res.data.status === 'already-fresh') {
            const summary = await fetchPlayerByNickname(term, {
              userNum: options.userNum,
              seasonId: options.seasonId,
            })
            if (cancelled || options.navigationKey !== baselineNavigationKey) return
            const writeCtx = {
              refreshNavigationKey: baselineNavigationKey,
              activeNavigationKey: options.navigationKey,
              expectedUserNum: options.userNum,
              expectedNickname: term,
            }
            if (summary.data && assertSummaryWriteIdentity(summary.data, writeCtx)) {
              queryClient.setQueryData(playerQueryKeys.summary(summaryPendingScope), summary.data)
            }
            await queryClient.invalidateQueries({
              queryKey: playerQueryKeys.seasonsPrefix(ownerScope),
              refetchType: 'active',
            })
          }
        }
        if (!cancelled && options.navigationKey === baselineNavigationKey) setPhase(nextPhase)
      } catch {
        if (!cancelled && options.navigationKey === baselineNavigationKey) setPhase('failed')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    dataSource,
    options.enabled,
    options.entryFreshnessSuppressed,
    options.manualRefreshActive,
    options.navigationKey,
    options.nickname,
    options.ownerScope,
    options.seasonId,
    options.userNum,
    queryClient,
    term,
  ])

  return { phase, lastResult }
}
