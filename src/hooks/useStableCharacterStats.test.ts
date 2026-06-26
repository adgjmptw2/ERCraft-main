import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { SelectProfileCharacterReportsInput } from '@/analysis/profileCharacterStatsPriority'
import type { UseStableCharacterStatsInput } from '@/hooks/useStableCharacterStats'
import { useStableCharacterStats } from '@/hooks/useStableCharacterStats'
import type { CharacterAnalysisReport } from '@/analysis/types'

function richReport(characterNum: number, matchCount = 12): CharacterAnalysisReport {
  return {
    characterNum,
    characterName: `캐릭터 ${characterNum}`,
    matchCount,
    avgPlacement: 4,
    avgKills: 2.5,
    avgAssists: 2,
    avgTeamKills: 8,
    avgDamageToPlayers: 12000,
    kda: 3.2,
    top3Rate: 40,
    winRate: 30,
    overallScore: null,
    status: 'ok',
    overallGrade: 'A',
    gradeLabel: 'A',
    feedback: 'test',
  }
}

function baseInput(
  overrides: Partial<SelectProfileCharacterReportsInput> = {},
): SelectProfileCharacterReportsInput {
  return {
    aggregate: null,
    aggregateReports: [],
    statsReports: [],
    recentReports: [],
    playerMatchReports: [richReport(19)],
    aggregateShouldWait: false,
    ...overrides,
  }
}

function baseProps(
  overrides: Partial<UseStableCharacterStatsInput> = {},
): UseStableCharacterStatsInput {
  return {
    nickname: '절단마술사',
    userNum: 123,
    seasonId: 11,
    navigationKey: 'nav-test',
    routeSummaryReady: true,
    statsUserNum: 123,
    statsQueryStatus: 'success',
    statsFetchStatus: 'idle',
    statsDataUpdatedAt: 100,
    playerMatchMeta: {
      status: 'complete',
      userNum: 123,
      seasonId: 11,
      generatedAt: '2026-06-19T00:00:00.000Z',
      rowCount: 1,
      matchCount: 12,
    },
    officialRowCount: 3,
    playerMatchRowCount: 1,
    selectionInput: baseInput(),
    manualRefreshActive: false,
    isFirstCollect: false,
    liveSnapshotUnlocked: false,
    ...overrides,
  }
}

describe('useStableCharacterStats', () => {
  it('refetch 중 playerMatch가 비어도 stable rows 유지', () => {
    const props = baseProps()
    const stableHook = renderHook((input) => useStableCharacterStats(input), {
      initialProps: props,
    })

    expect(stableHook.result.current.reports).toHaveLength(1)

    stableHook.rerender({
      ...props,
      playerMatchRowCount: 0,
      selectionInput: baseInput({ playerMatchReports: [] }),
      statsFetchStatus: 'fetching',
      manualRefreshActive: true,
      playerMatchMeta: {
        status: 'partial',
        userNum: 123,
        seasonId: 11,
        generatedAt: '2026-06-19T00:00:01.000Z',
        rowCount: 0,
        matchCount: 12,
        reason: 'aggregation-empty',
      },
    })

    expect(stableHook.result.current.reports).toHaveLength(1)
    expect(Number.isFinite(stableHook.result.current.reports[0]?.kda)).toBe(true)
  })

  it('authoritative newer player-match는 stable을 갱신한다', () => {
    const props = baseProps()
    const stableHook = renderHook((input) => useStableCharacterStats(input), {
      initialProps: props,
    })

    stableHook.rerender({
      ...props,
      statsDataUpdatedAt: 200,
      playerMatchRowCount: 2,
      selectionInput: baseInput({
        playerMatchReports: [richReport(19, 14), richReport(17, 8)],
      }),
      playerMatchMeta: {
        status: 'complete',
        userNum: 123,
        seasonId: 11,
        generatedAt: '2026-06-19T00:00:02.000Z',
        rowCount: 2,
        matchCount: 22,
      },
    })

    expect(stableHook.result.current.reports).toHaveLength(2)
    expect(stableHook.result.current.reports[0]?.matchCount).toBe(14)
  })

  it('A → B 전환 시 B 데이터만 표시', () => {
    const stableHook = renderHook((input) => useStableCharacterStats(input), {
      initialProps: baseProps({
        nickname: '연서',
        userNum: 1,
        statsUserNum: 1,
        selectionInput: baseInput({ playerMatchReports: [richReport(19, 20)] }),
      }),
    })

    stableHook.rerender(
      baseProps({
        nickname: '하잉',
        userNum: 2,
        statsUserNum: 2,
        selectionInput: baseInput({ playerMatchReports: [richReport(11, 5)] }),
      }),
    )

    expect(stableHook.result.current.reports[0]?.characterNum).toBe(11)
    expect(stableHook.result.current.reports[0]?.matchCount).toBe(5)
  })
})
