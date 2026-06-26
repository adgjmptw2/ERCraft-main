import { describe, expect, it } from 'vitest'

import {
  buildCharacterStatsIdentityKey,
  resolveStableCharacterStatsSelection,
  statsIdentityMatches,
} from '@/analysis/characterStatsStability'
import type { SelectProfileCharacterReportsResult } from '@/analysis/profileCharacterStatsPriority'
import type { CharacterAnalysisReport } from '@/analysis/types'

function richReport(name: string, characterNum: number): CharacterAnalysisReport {
  return {
    characterNum,
    characterName: name,
    matchCount: 20,
    avgPlacement: 4,
    avgKills: 2,
    avgAssists: 2,
    avgTeamKills: 8,
    avgDamageToPlayers: 12000,
    kda: 3,
    top3Rate: 40,
    winRate: 30,
    overallScore: null,
    status: 'ok',
    overallGrade: 'A',
    gradeLabel: 'A',
    feedback: 'test',
  }
}

function playerMatchSelection(name: string, characterNum: number): SelectProfileCharacterReportsResult {
  return {
    reports: [richReport(name, characterNum)],
    source: 'player-match',
    preferOfficialStatsDespitePartial: false,
  }
}

describe('characterStatsStability identity handoff contract', () => {
  it('summary userNum 미확정(0)이면 stats owner match가 false', () => {
    expect(statsIdentityMatches(0, 111)).toBe(false)
  })

  it('stats userNum null이면 owner match가 false', () => {
    expect(statsIdentityMatches(222, null)).toBe(false)
  })

  it('route summary 미준비 시 identity key가 null', () => {
    expect(
      buildCharacterStatsIdentityKey({
        nickname: 'bob',
        userNum: 222,
        seasonId: 11,
        routeSummaryReady: false,
      }),
    ).toBeNull()
  })

  it('identity mismatch면 incoming을 표시하지 않고 empty를 반환한다', () => {
    const incoming = playerMatchSelection('엠마', 19)
    const resolved = resolveStableCharacterStatsSelection({
      incoming,
      stable: null,
      identityMatched: false,
    })

    expect(resolved.pickReason).toBe('identity-mismatch')
    expect(resolved.selection.reports).toHaveLength(0)
  })
})
