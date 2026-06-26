import { describe, expect, it } from 'vitest'

import {
  applyTierConditionedOverallGrade,
  buildRealProfileAnalysis,
  buildRealProfileCharacterReports,
  resolveTierConditionedOverallGrade,
  SEASON_CHARACTER_STATS_LABEL,
} from '@/analysis/realProfileReport'
import type { MatchSummary } from '@/types/match'
import type { PlayerStatsDTO } from '@/types/player'

function makeMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: '1',
    userNum: 1,
    characterNum: 11,
    characterName: 'Yuki',
    placement: 3,
    kills: 2,
    deaths: 1,
    assists: 1,
    gameStartedAt: '2026-06-01T00:00:00Z',
    victory: true,
    gameMode: 'rank',
    ...overrides,
  }
}

const baseStatsDto: PlayerStatsDTO = {
  games: 40,
  winRate: 55,
  avgKills: 3.2,
  avgPlacement: 4.5,
  kda: 3.1,
  kdaString: '3.10',
  mostPlayedCharacter: { name: '유키', count: 10 },
  tier: 'DIAMOND2',
  mmr: 2400,
}

describe('buildRealProfileCharacterReports', () => {
  it('loadedMatches가 없고 characterStats가 있으면 시즌 집계 캐릭터 통계를 사용', () => {
    const result = buildRealProfileCharacterReports(
      [
        {
          characterCode: 11,
          totalGames: 12,
          wins: 6,
          top3: 8,
          averageRank: 3.5,
        },
      ],
      [],
    )
    expect(result.source).toBe('season')
    expect(result.sourceLabel).toBe(SEASON_CHARACTER_STATS_LABEL)
    expect(result.reports[0]?.matchCount).toBe(12)
    expect(result.reports[0]?.characterNum).toBe(11)
  })

  it('characterStats가 있어도 loadedMatches가 있으면 상세 지표는 최근 경기 기준을 우선 사용', () => {
    const result = buildRealProfileCharacterReports(
      [
        {
          characterCode: 11,
          totalGames: 12,
          wins: 6,
          top3: 8,
          averageRank: 3.5,
        },
      ],
      [
        makeMatch({ matchId: '1', kills: 3, assists: 3, deaths: 1, teamKills: 10, damageToPlayers: 12000 }),
        makeMatch({ matchId: '2', kills: 5, assists: 1, deaths: 2, teamKills: 8, damageToPlayers: 14000 }),
        makeMatch({ matchId: '3', kills: 4, assists: 2, deaths: 1, teamKills: 12, damageToPlayers: 16000 }),
      ],
    )
    expect(result.source).toBe('recent-matches')
    expect(result.sourceLabel).toBe('최근 3경기 기준')
    expect(result.reports[0]?.matchCount).toBe(3)
    expect(result.reports[0]?.avgKills).toBeGreaterThan(0)
    expect(result.reports[0]?.avgTeamKills).toBeGreaterThan(0)
    expect(result.reports[0]?.avgDamageToPlayers).toBeGreaterThan(0)
    expect(result.reports[0]?.kda).toBeGreaterThan(0)
  })

  it('characterStats가 없으면 loadedMatches 기반 최근 N경기 fallback', () => {
    const matches = [
      makeMatch({ matchId: '1' }),
      makeMatch({ matchId: '2', placement: 5, victory: false }),
      makeMatch({ matchId: '3' }),
    ]
    const result = buildRealProfileCharacterReports(undefined, matches)
    expect(result.source).toBe('recent-matches')
    expect(result.sourceLabel).toBe('최근 3경기 기준')
    expect(result.reports.length).toBeGreaterThan(0)
  })

  it('데이터 부족 시 crash 없이 빈 배열', () => {
    const result = buildRealProfileCharacterReports([], [])
    expect(result.reports).toEqual([])
    expect(result.source).toBeNull()
  })
})

describe('buildRealProfileAnalysis', () => {
  it('matches 기반 fallback일 때 sourceLabel이 최근 N경기 기준', () => {
    const output = buildRealProfileAnalysis({
      nickname: '테스트',
      statsDto: { ...baseStatsDto, characterStats: [] },
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches: [
        makeMatch({ matchId: '1' }),
        makeMatch({ matchId: '2' }),
        makeMatch({ matchId: '3' }),
      ],
    })
    expect(output.characterStatsSource).toBe('recent-matches')
    expect(output.characterStatsSourceLabel).toBe('최근 3경기 기준')
    expect(output.analysisReport?.status).toBe('ok')
  })

  it('characterStats 기반일 때 시즌 집계 기준', () => {
    const output = buildRealProfileAnalysis({
      nickname: '테스트',
      statsDto: {
        ...baseStatsDto,
        characterStats: [{ characterCode: 11, totalGames: 20, wins: 10, top3: 14, averageRank: 3.2 }],
      },
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches: [],
    })
    expect(output.characterStatsSource).toBe('season')
    expect(output.characterStatsSourceLabel).toBe(SEASON_CHARACTER_STATS_LABEL)
    expect(output.analysisCharacterReports[0]?.matchCount).toBe(20)
  })

  it('표본 부족 시 insufficient report', () => {
    const output = buildRealProfileAnalysis({
      nickname: '테스트',
      statsDto: null,
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches: [makeMatch()],
    })
    expect(output.analysisReport?.status).toBe('insufficient')
    expect(output.analysisMatches).toHaveLength(1)
    expect(output.analysisEligibility.analysisEligibleMatches).toBe(1)
  })

  it('production axes 없으면 playStyleAnalysis는 insufficient', () => {
    const loadedMatches = [
      makeMatch({ matchId: '1', placement: 1, kills: 5, damageToPlayers: 13000, teamKills: 8, animalKills: 8, gameDuration: 1100, credit: 700 }),
      makeMatch({ matchId: '2', placement: 3, kills: 3, victory: false, damageToPlayers: 9000, teamKills: 7, animalKills: 7, gameDuration: 1000, credit: 650 }),
      makeMatch({ matchId: '3', placement: 5, kills: 2, victory: false, damageToPlayers: 7000, teamKills: 5, animalKills: 6, gameDuration: 950, credit: 600 }),
      makeMatch({ matchId: '4', placement: 2, kills: 4, damageToPlayers: 11000, teamKills: 7, animalKills: 9, gameDuration: 1150, credit: 750 }),
    ]
    const output = buildRealProfileAnalysis({
      nickname: '테스트',
      statsDto: { ...baseStatsDto, characterStats: [] },
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches,
    })

    expect(output.playStyleAnalysis.status).toBe('insufficient')
    expect(output.analysisMatches).toHaveLength(4)
  })

  it('production axes가 있으면 playStyleAnalysis를 생성한다', () => {
    const loadedMatches = [
      makeMatch({ matchId: '1', placement: 1, kills: 5, damageToPlayers: 13000, teamKills: 8, animalKills: 8, gameDuration: 1100, credit: 700 }),
      makeMatch({ matchId: '2', placement: 3, kills: 3, victory: false, damageToPlayers: 9000, teamKills: 7, animalKills: 7, gameDuration: 1000, credit: 650 }),
      makeMatch({ matchId: '3', placement: 5, kills: 2, victory: false, damageToPlayers: 7000, teamKills: 5, animalKills: 6, gameDuration: 950, credit: 600 }),
      makeMatch({ matchId: '4', placement: 2, kills: 4, damageToPlayers: 11000, teamKills: 7, animalKills: 9, gameDuration: 1150, credit: 750 }),
    ]
    const output = buildRealProfileAnalysis({
      nickname: '테스트',
      statsDto: {
        ...baseStatsDto,
        characterStats: [],
        overallAnalysisAxes: {
          version: 'production-analysis-axes.v1.1',
          metricPresetVersion: 'character-grade-production',
          scope: 'overall',
          sampleCount: 4,
          aggregationPolicy: 'production-overall-direct-match-mean',
          axes: [
            { axis: 'survival', label: '생존', score: 72, referenceScore: 65, status: 'ready', sampleCount: 4, components: [], description: '' },
            { axis: 'combat', label: '교전', score: 76, referenceScore: 65, status: 'ready', sampleCount: 4, components: [], description: '' },
            { axis: 'macro', label: '운영', score: 68, referenceScore: 65, status: 'ready', sampleCount: 4, components: [], description: '' },
            { axis: 'support', label: '지원', score: 70, referenceScore: 65, status: 'ready', sampleCount: 4, components: [], description: '' },
            { axis: 'finish', label: '마무리', score: 74, referenceScore: 65, status: 'ready', sampleCount: 4, components: [], description: '' },
            { axis: 'consistency', label: '일관성', score: 82, referenceScore: 65, status: 'ready', sampleCount: 4, components: [], description: '' },
          ],
        },
      },
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches,
    })

    expect(output.playStyleAnalysis.status).toBe('ok')
    expect(output.playStyleAnalysis.sampleSize).toBe(4)
    expect(output.playStyleAnalysis.chartData).toHaveLength(6)
  })

  it('현재 시즌에서 API seasonId 매치만 있어도 최근 경기 분석을 유지', () => {
    const loadedMatches = [
      makeMatch({ matchId: 'api-1', seasonNumber: 39, placement: 2 }),
      makeMatch({ matchId: 'api-2', seasonNumber: 39, placement: 4 }),
      makeMatch({ matchId: 'api-3', seasonNumber: 39, placement: 1 }),
    ]
    const output = buildRealProfileAnalysis({
      nickname: '테스트',
      statsDto: { ...baseStatsDto, characterStats: [] },
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches,
    })

    expect(output.analysisMatches).toHaveLength(3)
    expect(output.analysisBasisLabel).toBe('최근 경기 분석: 현재 로드된 3경기 기준')
    expect(output.playStyleAnalysis.status).toBe('insufficient')
  })
})

describe('tier-conditioned overall grade', () => {
  it('weights character gradeScore by grade sample size', () => {
    const resolved = resolveTierConditionedOverallGrade([
      {
        characterNum: 1,
        characterName: '유키',
        matchCount: 10,
        avgPlacement: 3,
        avgKills: 3,
        avgAssists: 3,
        avgTeamKills: 8,
        avgDamageToPlayers: 12_000,
        kda: 3,
        top3Rate: 60,
        winRate: 30,
        overallScore: null,
        status: 'ok',
        overallGrade: null,
        gradeLabel: 'A',
        gradeScore: 80,
        gradeStatus: 'ok',
        gradeSampleSize: 10,
        feedback: '',
      },
      {
        characterNum: 73,
        characterName: '샬럿',
        matchCount: 30,
        avgPlacement: 4,
        avgKills: 1,
        avgAssists: 6,
        avgTeamKills: 9,
        avgDamageToPlayers: 5_000,
        kda: 3,
        top3Rate: 50,
        winRate: 20,
        overallScore: null,
        status: 'ok',
        overallGrade: null,
        gradeLabel: 'B',
        gradeScore: 60,
        gradeStatus: 'ok',
        gradeSampleSize: 30,
        feedback: '',
      },
    ])

    expect(resolved?.score).toBe(65)
    expect(resolved?.grade).toBe('B')
    expect(resolved?.sampleSize).toBe(40)
  })

  it('injects overall grade into real profile report without using recent-only grades', () => {
    const report = buildRealProfileAnalysis({
      nickname: '테스트',
      statsDto: baseStatsDto,
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches: [],
    }).analysisReport

    const updated = applyTierConditionedOverallGrade(
      report,
      [
        {
          characterNum: 1,
          characterName: '유키',
          matchCount: 20,
          avgPlacement: 3,
          avgKills: 3,
          avgAssists: 3,
          avgTeamKills: 8,
          avgDamageToPlayers: 12_000,
          kda: 3,
          top3Rate: 60,
          winRate: 30,
          overallScore: null,
          status: 'ok',
          overallGrade: null,
          gradeLabel: 'A',
          gradeScore: 78,
          gradeStatus: 'ok',
          gradeSampleSize: 20,
          feedback: '',
        },
      ],
      '랭크 집계 기준',
    )

    expect(updated?.overallGrade).toBe('A')
    expect(updated?.overallPerformanceScore).toBe(78)
    expect(updated?.overallPercentile).toBeNull()
    expect(updated?.overallScoreSource).toBe('character-grade-weighted-average')
    expect(updated?.gradedCharacterCount).toBe(1)
    expect(updated?.weightedMatchCount).toBe(20)
    expect(updated?.sampleSize).toBe(20)
    expect(updated?.baselineLabel).toBe('랭크 집계 기준')
  })

  it('uses API overall aggregate even when local character fallback cannot resolve', () => {
    const report = buildRealProfileAnalysis({
      nickname: '찬형',
      statsDto: baseStatsDto,
      currentSeason: 11,
      selectedSeason: 11,
      loadedMatches: [],
    }).analysisReport

    const updated = applyTierConditionedOverallGrade(
      report,
      [],
      '랭크 집계 기준',
      {
        overallGradeVersion: 'overall-aggregate-grade.v4',
        overallPerformanceScore: 74.88,
        overallGrade: 'A-',
        overallScoreSource: 'overall-aggregate-grade-v4',
        basePerformanceScore: 75.09,
        outcomePerformanceScore: null,
        consistencyScore: null,
        outcomeModifier: 0,
        consistencyModifier: 0,
        totalModifier: -0.21,
        overallConfidence: 0.9815,
        overallConfidenceLabel: 'high',
        weightedMatchCount: 53,
        gradedCharacterCount: 4,
      },
    )

    expect(updated?.overallGrade).toBe('A-')
    expect(updated?.overallPerformanceScore).toBe(74.88)
    expect(updated?.overallScoreSource).toBe('overall-aggregate-grade-v4')
    expect(updated?.weightedMatchCount).toBe(53)
    expect(updated?.summary).toContain('53경기')
  })
})
