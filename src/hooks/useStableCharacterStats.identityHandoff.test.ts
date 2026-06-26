import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { SelectProfileCharacterReportsInput } from '@/analysis/profileCharacterStatsPriority'
import type { UseStableCharacterStatsInput } from '@/hooks/useStableCharacterStats'
import { useStableCharacterStats } from '@/hooks/useStableCharacterStats'
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

function selectionInput(
  reports: CharacterAnalysisReport[],
): SelectProfileCharacterReportsInput {
  return {
    aggregate: null,
    aggregateReports: [],
    statsReports: [],
    recentReports: [],
    playerMatchReports: reports,
    aggregateShouldWait: false,
  }
}

function baseProps(
  overrides: Partial<UseStableCharacterStatsInput> = {},
): UseStableCharacterStatsInput {
  return {
    nickname: 'bob',
    userNum: 0,
    seasonId: 11,
    navigationKey: 'nav-1',
    routeSummaryReady: false,
    statsUserNum: 111,
    statsQueryStatus: 'success',
    statsFetchStatus: 'fetching',
    statsDataUpdatedAt: 100,
    playerMatchMeta: null,
    officialRowCount: 0,
    playerMatchRowCount: 1,
    selectionInput: selectionInput([richReport('엠마', 19)]),
    manualRefreshActive: false,
    isFirstCollect: false,
    liveSnapshotUnlocked: false,
    ...overrides,
  }
}

describe('useStableCharacterStats identity handoff contract', () => {
  it('B route + summary 미준비면 A placeholder stats를 표시하지 않는다', () => {
    const hook = renderHook((input) => useStableCharacterStats(input), {
      initialProps: baseProps(),
    })

    expect(hook.result.current.reports).toHaveLength(0)
    expect(hook.result.current.identityKey).toBeNull()
  })

  it('B summary 도착 + A owner mismatch면 A 캐릭터를 표시하지 않는다', () => {
    const hook = renderHook((input) => useStableCharacterStats(input), {
      initialProps: baseProps({
        userNum: 222,
        routeSummaryReady: true,
        statsUserNum: 111,
      }),
    })

    expect(hook.result.current.reports).toHaveLength(0)
  })

  it('B summary 도착 + B owner matched stats면 B 캐릭터를 표시한다', () => {
    const hook = renderHook((input) => useStableCharacterStats(input), {
      initialProps: baseProps({
        userNum: 222,
        routeSummaryReady: true,
        statsUserNum: 222,
        selectionInput: selectionInput([richReport('리오', 1)]),
      }),
    })

    expect(hook.result.current.reports[0]?.characterName).toBe('리오')
  })
})
