import { describe, expect, it } from 'vitest'

import { buildCollectorAuditReport, estimateDailyApiCalls } from './collectorAudit.js'

describe('collector audit dry-run', () => {
  it('estimates API calls without external calls or DB writes', () => {
    expect(estimateDailyApiCalls(50)).toEqual({
      minimumUserGamesCalls: 50,
      conservativeTwoPageCalls: 100,
    })
  })

  it('reports read-only dry-run constraints', () => {
    const report = buildCollectorAuditReport({
      playerMatchRows: [{ uid: 'uid-a', playedAt: new Date('2026-06-01T00:00:00.000Z') }],
      nicknameBindings: [{ canonicalUid: 'uid-b' }],
      routeCodeFindings: {
        hasBackfillWorker: true,
        hasInternalChunkTimer: true,
        hasRefreshOnlyExternalFetch: true,
      },
      generatedAt: 'fixed',
    })
    expect(report.externalApiCalls).toBe(0)
    expect(report.dbWrites).toBe(0)
    expect(report.readOnly).toBe(true)
    expect(report.automaticJobExists).toBe(false)
    expect(report.candidatePlayers).toBe(2)
    expect(report.incrementalCollectionPossible).toBe(true)
  })
})

