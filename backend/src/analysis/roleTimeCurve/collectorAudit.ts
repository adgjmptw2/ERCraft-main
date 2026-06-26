import type { CollectorAuditReport } from './roleTimeCurve.js'

export interface CollectorAuditInput {
  playerMatchRows: Array<{ uid: string; playedAt: Date }>
  nicknameBindings: Array<{ canonicalUid: string }>
  routeCodeFindings: {
    hasBackfillWorker: boolean
    hasInternalChunkTimer: boolean
    hasRefreshOnlyExternalFetch: boolean
  }
  generatedAt?: string
}

export function estimateDailyApiCalls(playerCount: number): {
  minimumUserGamesCalls: number
  conservativeTwoPageCalls: number
} {
  const count = Math.max(0, Math.floor(playerCount))
  return {
    minimumUserGamesCalls: count,
    conservativeTwoPageCalls: count * 2,
  }
}

export function buildCollectorAuditReport(input: CollectorAuditInput): CollectorAuditReport {
  const candidateUidSet = new Set(input.playerMatchRows.map((row) => row.uid))
  for (const binding of input.nicknameBindings) {
    candidateUidSet.add(binding.canonicalUid)
  }

  const latestSavedMatchAt =
    input.playerMatchRows
      .map((row) => row.playedAt)
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ?? null

  const automaticJobExists = false
  const automaticJobSummary =
    input.routeCodeFindings.hasBackfillWorker || input.routeCodeFindings.hasInternalChunkTimer
      ? 'Route-triggered refresh/backfill workers exist, but no autonomous cron/scheduler starts collection without a search or explicit refresh.'
      : 'No autonomous collection job found.'

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    readOnly: true,
    externalApiCalls: 0,
    dbWrites: 0,
    automaticJobExists,
    automaticJobSummary,
    candidatePlayers: candidateUidSet.size,
    playerMatchRows: input.playerMatchRows.length,
    playersWithNicknameBinding: new Set(input.nicknameBindings.map((row) => row.canonicalUid)).size,
    latestSavedMatchAt,
    incrementalCollectionPossible: candidateUidSet.size > 0 && latestSavedMatchAt != null,
    estimatedDailyApiCalls: {
      '50': estimateDailyApiCalls(50),
      '100': estimateDailyApiCalls(100),
      '500': estimateDailyApiCalls(500),
    },
    limitations: [
      'A loop over existing DB players can refresh known players, but cannot discover new low-tier players by itself.',
      'Dry-run does not call BSER and does not write PlayerMatch, ProfileRefreshState, or backfill state.',
      input.routeCodeFindings.hasRefreshOnlyExternalFetch
        ? 'Current profile flow keeps external match fetch behind explicit refresh=true or route-triggered warmup/backfill policy.'
        : 'Refresh-only external fetch path was not detected by static audit and should be rechecked before enabling a collector.',
    ],
  }
}

