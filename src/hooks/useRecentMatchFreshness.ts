import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { fetchPlayerByNickname } from '@/api/player'
import { isRealMode } from '@/api/erClient'
import type { PlayerSummary } from '@/types/player'
import { assertSummaryWriteIdentity } from '@/utils/profileCacheWriteGuard'
import {
  normalizePlayerNickname,
  playerQueryKeys,
  playerQueryOwnerScope,
  type PlayerDataSource,
  type PlayerQueryOwnerScope,
} from '@/utils/playerQueryKeys'
import { parseRefreshTimestamp } from '@/utils/refreshTimeLabel'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 90_000

export type RecentMatchFreshnessPhase =
  | 'idle'
  | 'checking'
  | 'updated'
  | 'no-change'
  | 'failed'
  | 'cooldown'

type RecentMatchCheckStatus = NonNullable<PlayerSummary['recentMatchCheckStatus']>

export interface UseRecentMatchFreshnessOptions {
  enabled: boolean
  nickname: string
  navigationKey: string
  dataSource?: PlayerDataSource
  ownerScope?: PlayerQueryOwnerScope
  expectedUserNum?: number | null
  summary?: Pick<
    PlayerSummary,
    'lastRefreshedAt' | 'lastCheckedAt' | 'recentMatchCheckStatus' | 'hasProfileCache'
  > | null
  manualRefreshActive: boolean
  onFreshnessUpdated?: (summary: PlayerSummary) => void
}

export interface UseRecentMatchFreshnessResult {
  phase: RecentMatchFreshnessPhase
}

function isCheckingStatus(status: RecentMatchCheckStatus | undefined): boolean {
  return status === 'scheduled' || status === 'skipped-inflight'
}

function resolveIdlePhase(status: RecentMatchCheckStatus | undefined): RecentMatchFreshnessPhase {
  if (status === 'skipped-cooldown') return 'cooldown'
  return 'idle'
}

function shouldStopPolling(status: RecentMatchCheckStatus | undefined): boolean {
  if (!status) return false
  return (
    status === 'skipped-fresh' ||
    status === 'skipped-cooldown' ||
    status === 'skipped-explicit-refresh' ||
    status === 'skipped-no-profile-cache'
  )
}

export function useRecentMatchFreshness(
  options: UseRecentMatchFreshnessOptions,
): UseRecentMatchFreshnessResult {
  const queryClient = useQueryClient()
  const term = normalizePlayerNickname(options.nickname)
  const dataSource = options.dataSource ?? (isRealMode() ? 'real' : 'demo')
  const [phase, setPhase] = useState<RecentMatchFreshnessPhase>(() =>
    isCheckingStatus(options.summary?.recentMatchCheckStatus)
      ? 'checking'
      : resolveIdlePhase(options.summary?.recentMatchCheckStatus),
  )

  useEffect(() => {
    if (
      !options.enabled ||
      !isRealMode() ||
      term.length === 0 ||
      options.manualRefreshActive ||
      options.summary?.hasProfileCache !== true
    ) {
      setPhase('idle')
      return
    }

    const initialStatus = options.summary?.recentMatchCheckStatus
    if (!isCheckingStatus(initialStatus)) {
      setPhase(resolveIdlePhase(initialStatus))
      return
    }

    setPhase('checking')

    const summaryPendingScope = playerQueryOwnerScope({ nickname: term, dataSource })
    const ownerScope =
      options.ownerScope ??
      playerQueryOwnerScope({
        nickname: term,
        dataSource,
        userNum: options.expectedUserNum,
      })

    const baseline = {
      navigationKey: options.navigationKey,
      lastRefreshedAt: options.summary?.lastRefreshedAt ?? null,
      lastCheckedAt: options.summary?.lastCheckedAt ?? null,
    }
    let cancelled = false
    let invalidated = false
    const started = Date.now()

    const invalidateOnce = async () => {
      if (invalidated) return
      invalidated = true
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
      ])
    }

    const pollOnce = async (): Promise<RecentMatchFreshnessPhase | 'continue'> => {
      try {
        const res = await fetchPlayerByNickname(term)
        const next = res.data
        if (!next) return 'continue'
        if (cancelled || options.navigationKey !== baseline.navigationKey) return 'idle'

        const writeCtx = {
          refreshNavigationKey: baseline.navigationKey,
          activeNavigationKey: options.navigationKey,
          expectedUserNum: options.expectedUserNum,
          expectedNickname: term,
        }
        if (assertSummaryWriteIdentity(next, writeCtx)) {
          queryClient.setQueryData(playerQueryKeys.summary(summaryPendingScope), next)
          options.onFreshnessUpdated?.(next)
        }

        const refreshedChanged =
          baseline.lastRefreshedAt !== (next.lastRefreshedAt ?? null) &&
          parseRefreshTimestamp(next.lastRefreshedAt) != null
        const checkedChanged =
          baseline.lastCheckedAt !== (next.lastCheckedAt ?? null) &&
          parseRefreshTimestamp(next.lastCheckedAt) != null

        if (refreshedChanged) {
          await invalidateOnce()
          return 'updated'
        }

        if (checkedChanged && shouldStopPolling(next.recentMatchCheckStatus)) {
          return 'no-change'
        }

        if (next.recentMatchCheckStatus === 'skipped-cooldown' && !checkedChanged) {
          return 'failed'
        }

        if (shouldStopPolling(next.recentMatchCheckStatus)) {
          return checkedChanged ? 'no-change' : 'failed'
        }

        if (!isCheckingStatus(next.recentMatchCheckStatus)) {
          return checkedChanged ? 'no-change' : 'idle'
        }

        return 'continue'
      } catch {
        return 'continue'
      }
    }

    const run = async () => {
      for (;;) {
        if (cancelled || Date.now() - started >= POLL_TIMEOUT_MS) {
          if (!cancelled) setPhase('failed')
          return
        }

        const outcome = await pollOnce()
        if (cancelled) return
        if (outcome !== 'continue') {
          setPhase(outcome)
          return
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    dataSource,
    options.enabled,
    options.expectedUserNum,
    options.manualRefreshActive,
    options.navigationKey,
    options.nickname,
    options.onFreshnessUpdated,
    options.ownerScope,
    options.summary?.hasProfileCache,
    options.summary?.lastCheckedAt,
    options.summary?.lastRefreshedAt,
    options.summary?.recentMatchCheckStatus,
    queryClient,
    term,
  ])

  return { phase }
}
