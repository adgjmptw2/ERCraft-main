import { describe, expect, it } from 'vitest'

import {
  buildCharacterStatsIdentityKey,
  evaluateCharacterStatsAcceptDecision,
  isCharacterStatsDowngrade,
  isRichCharacterStatsSelection,
  resolveStableCharacterStatsSelection,
  shouldAcceptIncomingCharacterStats,
  statsIdentityMatches,
} from '@/analysis/characterStatsStability'
import {
  selectProfileCharacterReports,
  type SelectProfileCharacterReportsResult,
} from '@/analysis/profileCharacterStatsPriority'
import type { CharacterAnalysisReport } from '@/analysis/types'

function richReport(characterNum: number, matchCount: number, name?: string): CharacterAnalysisReport {
  return {
    characterNum,
    characterName: name ?? `캐릭터 ${characterNum}`,
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

function sparseReport(characterNum: number, matchCount: number): CharacterAnalysisReport {
  return {
    ...richReport(characterNum, matchCount),
    avgKills: Number.NaN,
    avgAssists: Number.NaN,
    avgTeamKills: null,
    avgDamageToPlayers: null,
    kda: Number.NaN,
    gradeLabel: '시즌',
  }
}

function playerMatchSelection(rows: CharacterAnalysisReport[]): SelectProfileCharacterReportsResult {
  return {
    reports: rows,
    source: 'player-match',
    preferOfficialStatsDespitePartial: false,
  }
}

function officialSelection(rows: CharacterAnalysisReport[]): SelectProfileCharacterReportsResult {
  return {
    reports: rows,
    source: 'official-stats',
    preferOfficialStatsDespitePartial: false,
  }
}

describe('characterStatsStability', () => {
  it('rich → refetch empty는 stable 유지', () => {
    const stable = playerMatchSelection(Array.from({ length: 40 }, (_, i) => richReport(i + 1, 10)))
    const incoming = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports: [],
      recentReports: [],
      playerMatchReports: [],
      aggregateShouldWait: false,
    })

    const resolved = resolveStableCharacterStatsSelection({
      incoming,
      stable,
      identityMatched: true,
    })

    expect(resolved.pickReason).toBe('stable')
    expect(resolved.selection.reports).toHaveLength(40)
    expect(Number.isFinite(resolved.selection.reports[0]?.kda)).toBe(true)
  })

  it('rich → official sparse는 stable 유지', () => {
    const stable = playerMatchSelection([
      richReport(19, 120, '엠마'),
      richReport(17, 80, '아드리아나'),
      richReport(11, 40, '유키'),
      ...Array.from({ length: 37 }, (_, i) => richReport(i + 20, 5)),
    ])
    const incoming = officialSelection([
      sparseReport(19, 120),
      sparseReport(17, 80),
      sparseReport(11, 40),
    ])

    expect(isCharacterStatsDowngrade(stable, incoming)).toBe(true)
    expect(
      resolveStableCharacterStatsSelection({
        incoming,
        stable,
        identityMatched: true,
      }).pickReason,
    ).toBe('stable')
  })

  it('rich → backend transient empty는 stable 유지', () => {
    const stable = playerMatchSelection([richReport(19, 12, '엠마')])
    const incoming: SelectProfileCharacterReportsResult = {
      reports: [],
      source: 'none',
      preferOfficialStatsDespitePartial: false,
    }

    expect(
      resolveStableCharacterStatsSelection({
        incoming,
        stable,
        identityMatched: true,
      }).selection.reports,
    ).toHaveLength(1)
  })

  it('identity mismatch면 다른 유저 stable을 채택하지 않음', () => {
    const stable = playerMatchSelection([richReport(1, 10, 'A유저')])
    const incoming = playerMatchSelection([richReport(2, 8, 'B유저')])

    expect(statsIdentityMatches(111, 222)).toBe(false)
    expect(
      shouldAcceptIncomingCharacterStats(stable, incoming, { identityMatched: false }),
    ).toBe(false)
  })

  it('A → B incoming은 identity key가 다르면 snapshot이 분리된다', () => {
    const keyA = buildCharacterStatsIdentityKey({
      nickname: '연서',
      userNum: 1,
      seasonId: 11,
      routeSummaryReady: true,
    })
    const keyB = buildCharacterStatsIdentityKey({
      nickname: '하잉',
      userNum: 2,
      seasonId: 11,
      routeSummaryReady: true,
    })

    expect(keyA).not.toBe(keyB)
  })

  it('manual refresh 성공 시 더 풍부한 집계는 교체 가능', () => {
    const stable = playerMatchSelection([richReport(19, 10, '엠마')])
    const incoming = playerMatchSelection([
      richReport(19, 12, '엠마'),
      richReport(17, 8, '아드리아나'),
    ])

    expect(
      shouldAcceptIncomingCharacterStats(stable, incoming, { identityMatched: true }),
    ).toBe(true)
  })

  it('metric 전부 null row는 rich player-match source로 채택되지 않음', () => {
    const invalidRows = [
      {
        ...sparseReport(19, 10),
        matchCount: 10,
      },
    ]

    const selection = selectProfileCharacterReports({
      aggregate: null,
      aggregateReports: [],
      statsReports: [sparseReport(19, 120)],
      recentReports: [],
      playerMatchReports: invalidRows,
      aggregateShouldWait: false,
    })

    expect(selection.source).toBe('official-stats')
    expect(isRichCharacterStatsSelection(selection)).toBe(false)
  })

  it('provisional identity key는 userNum 없을 때 생성된다', () => {
    expect(
      buildCharacterStatsIdentityKey({
        nickname: '연서',
        userNum: 0,
        seasonId: 11,
        routeSummaryReady: true,
      }),
    ).toBe('연서:_:11')
    expect(
      buildCharacterStatsIdentityKey({
        nickname: '연서',
        userNum: 99,
        seasonId: 11,
        routeSummaryReady: true,
      }),
    ).toBe('연서:99:11')
  })

  it('authoritative player-match correction은 게임 수 감소여도 accept', () => {
    const stable = playerMatchSelection([richReport(19, 12, '엠마')])
    const incoming = playerMatchSelection([richReport(19, 10, '엠마')])

    expect(
      evaluateCharacterStatsAcceptDecision(stable, incoming, {
        identityMatched: true,
        incomingDataUpdatedAt: 200,
        stableDataUpdatedAt: 100,
        playerMatchMetaStatus: 'complete',
      }),
    ).toBe('accept_newer_authoritative')
  })

  it('partial empty는 transient로 거부', () => {
    const stable = playerMatchSelection([richReport(19, 12, '엠마')])
    const incoming: SelectProfileCharacterReportsResult = {
      reports: [],
      source: 'none',
      preferOfficialStatsDespitePartial: false,
    }

    expect(
      evaluateCharacterStatsAcceptDecision(stable, incoming, {
        identityMatched: true,
        playerMatchMetaStatus: 'partial',
      }),
    ).toBe('reject_transient_empty')
  })

  it('complete empty는 authoritative empty로 accept', () => {
    const stable = playerMatchSelection([richReport(19, 12, '엠마')])
    const incoming: SelectProfileCharacterReportsResult = {
      reports: [],
      source: 'player-match',
      preferOfficialStatsDespitePartial: false,
    }

    expect(
      evaluateCharacterStatsAcceptDecision(stable, incoming, {
        identityMatched: true,
        playerMatchMetaStatus: 'complete',
      }),
    ).toBe('accept')
  })
})
