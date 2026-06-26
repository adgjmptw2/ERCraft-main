import { describe, expect, it, beforeEach } from 'vitest'

import { lookupBaselineForCombination } from './baselineStore.js'
import { normalizeMetricScore, robustNormalizeMetricScore, weightedScore } from './metrics.js'
import {
  applyCharacterPerformanceGrades,
  computeLegacyMatchPerformanceGradeForCalibration,
  computeMatchPerformanceGrade,
  computeWeaponGroupScore,
} from './compute.js'
import { aggregateWeaponGroupStats } from './metrics.js'
import { applySampleConfidence, scoreToFineGrade } from './config.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import { resetLiveRoleMetricBaselineCache } from './roleMetricLiveGrade.js'
import {
  primeCombatContributionLiveCaches,
  resetCombatContributionLiveCaches,
} from './combatContributionLiveGrade.js'
import { roleScoreV3PlacementAdjustment } from '../roleScore/roleScoreV3.js'

const METEORITE_PLUS = 'meteorite_plus' as const

function buildMatchesFromStats(params: {
  characterNum: number
  weaponTypeId: number
  count: number
  winRate: number
  top3Rate: number
  avgPlacement: number
  avgKills?: number
  avgAssists?: number
  avgDeaths?: number
  avgTeamKills?: number
  avgDamage?: number
}) {
  const wins = Math.round(params.winRate * params.count)
  const top3 = Math.round(params.top3Rate * params.count)
  return Array.from({ length: params.count }, (_, index) => ({
    gameMode: 'rank',
    characterNum: params.characterNum,
    bestWeapon: params.weaponTypeId,
    placement: index < top3 ? 2 : Math.max(1, Math.round(params.avgPlacement)),
    kills: params.avgKills ?? 1,
    assists: params.avgAssists ?? 2,
    deaths: params.avgDeaths ?? 2,
    teamKills: params.avgTeamKills ?? 8,
    damageToPlayer: params.avgDamage ?? 5000,
    victory: index < wins,
    rawJson: null,
  }))
}

describe('characterPerformanceGrade metrics', () => {
  it('높을수록 좋은 지표 — tier 65 / elite 88', () => {
    expect(normalizeMetricScore(15, 5, 15, true)).toBe(88)
    expect(normalizeMetricScore(5, 5, 15, true)).toBe(65)
  })

  it('낮을수록 좋은 지표 — tier 65 / elite 88', () => {
    expect(normalizeMetricScore(2, 5, 2, false, 'averagePlace')).toBe(88)
    expect(normalizeMetricScore(5, 5, 2, false, 'averagePlace')).toBe(65)
  })

  it('tier=elite 동일값은 65', () => {
    expect(normalizeMetricScore(5, 5, 5, true)).toBe(65)
  })

  it('가중치 재분배', () => {
    expect(
      weightedScore([
        { score: 80, weight: 30 },
        { score: 70, weight: 0 },
      ]),
    ).toBe(80)
  })

  it('같은 characterNum·weaponTypeId 기준 조회', () => {
    const baseline = lookupBaselineForCombination('gold', 1, 14)
    expect(baseline?.metrics.count).toBeGreaterThan(30)
    expect(baseline?.tierKey).toBe('gold')
  })

  it('dakTier 필드는 baseline lookup에 사용하지 않음', () => {
    const baseline = lookupBaselineForCombination('gold', 1, 14)
    expect(baseline?.metrics).not.toHaveProperty('dakTier')
    expect(baseline?.metrics).not.toHaveProperty('dakRank')
  })
})

describe('applyCharacterPerformanceGrades', () => {
  beforeEach(() => {
    resetLiveRoleMetricBaselineCache()
    resetCombatContributionLiveCaches()
    primeCombatContributionLiveCaches({ baselineDocument: null, blocklist: null })
  })

  it('5게임 미만은 등급 없음', () => {
    const result = applyCharacterPerformanceGrades({
      rows: buildMatchesFromStats({
        characterNum: 1,
        weaponTypeId: 14,
        count: 4,
        winRate: 0.5,
        top3Rate: 0.5,
        avgPlacement: 3,
      }) as never,
      characterStats: [
        {
          characterNum: 1,
          games: 4,
          wins: 2,
          winRate: 50,
          avgRank: 3,
          kills: 20,
          assists: 8,
          deaths: 4,
          kda: 7,
          avgTeamKills: 8,
          avgKills: 5,
          avgDamage: 15000,
          gradeLabel: null,
        },
      ],
      metaStatus: 'complete',
      playerTier: getRankTierFromRp(6200),
    })
    expect(result[0]?.grade).toBeNull()
    expect(result[0]?.gradeStatus).toBe('insufficient-sample')
  })

  it('complete + 충분 표본이면 real grade 제공', () => {
    const rows = buildMatchesFromStats({
      characterNum: 1,
      weaponTypeId: 14,
      count: 6,
      winRate: 0.5,
      top3Rate: 0.5,
      avgPlacement: 2.5,
      avgKills: 6,
      avgAssists: 4,
      avgDeaths: 2,
      avgTeamKills: 12,
      avgDamage: 18000,
    })
    const result = applyCharacterPerformanceGrades({
      rows: rows as never,
      characterStats: [
        {
          characterNum: 1,
          games: 6,
          wins: 3,
          winRate: 50,
          avgRank: 2.5,
          kills: 36,
          assists: 24,
          deaths: 12,
          kda: 5,
          avgTeamKills: 12,
          avgKills: 6,
          avgDamage: 18000,
          gradeLabel: null,
        },
      ],
      metaStatus: 'complete',
      playerTier: getRankTierFromRp(4200),
    })
    expect(result[0]?.gradeStatus).toBe('ok')
    expect(result[0]?.grade).toMatch(/^[SABCD][+-]?$/)
    expect(result[0]?.gradeSampleSize).toBe(6)
  })

  it('partial meta는 partial-data', () => {
    const result = applyCharacterPerformanceGrades({
      rows: [],
      characterStats: [
        {
          characterNum: 1,
          games: 10,
          wins: 5,
          winRate: 50,
          avgRank: 3,
          kills: 20,
          assists: 10,
          deaths: 5,
          kda: 6,
          avgTeamKills: 8,
          avgKills: 2,
          avgDamage: 12000,
          gradeLabel: null,
        },
      ],
      metaStatus: 'partial',
      playerTier: getRankTierFromRp(4200),
    })
    expect(result[0]?.gradeStatus).toBe('partial-data')
    expect(result[0]?.grade).toBeNull()
  })

  it('샬럿 fixture — IN1000 역전이어도 등급 계산', () => {
    const rows = buildMatchesFromStats({
      characterNum: 73,
      weaponTypeId: 24,
      count: 32,
      winRate: 0.1875,
      top3Rate: 0.375,
      avgPlacement: 4.2,
      avgKills: 1.5,
      avgAssists: 4,
      avgDeaths: 2.1,
      avgTeamKills: 9,
      avgDamage: 4200,
    })
    const result = applyCharacterPerformanceGrades({
      rows: rows as never,
      characterStats: [{ characterNum: 73, games: 32, wins: 6, winRate: 18.75, avgRank: 4.2, kills: 48, assists: 128, deaths: 67, kda: 2.6, avgTeamKills: 9, avgKills: 1.5, avgDamage: 4200, gradeLabel: null }],
      metaStatus: 'complete',
      playerTier: getRankTierFromRp(6200),
    })
    expect(result[0]?.gradeStatus).toBe('ok')
    expect(result[0]?.grade).not.toBeNull()
    expect(result[0]?.gradeUsedFallback).toBe(false)
  })

  it('프리야·유민·바냐 fixture 등급 계산 가능', () => {
    const fixtures = [
      { characterNum: 51, weaponTypeId: 22, count: 29, winRate: 0.17, top3Rate: 0.41, avgPlacement: 4.1 },
      { characterNum: 77, weaponTypeId: 24, count: 20, winRate: 0.15, top3Rate: 0.4, avgPlacement: 4.2 },
      { characterNum: 64, weaponTypeId: 24, count: 18, winRate: 0.16, top3Rate: 0.42, avgPlacement: 4.15 },
    ]
    for (const fixture of fixtures) {
      const rows = buildMatchesFromStats(fixture)
      const result = applyCharacterPerformanceGrades({
        rows: rows as never,
        characterStats: [{ characterNum: fixture.characterNum, games: fixture.count, wins: 1, winRate: 10, avgRank: 4, kills: 1, assists: 1, deaths: 1, kda: 1, avgTeamKills: 1, avgKills: 1, avgDamage: 1, gradeLabel: null }],
        metaStatus: 'complete',
        playerTier: getRankTierFromRp(6200),
      })
      expect(result[0]?.gradeStatus).toBe('ok')
      expect(result[0]?.grade).not.toBeNull()
    }
  })

  it('레니 fixture — 등급 유지', () => {
    const rows = buildMatchesFromStats({
      characterNum: 69,
      weaponTypeId: 9,
      count: 69,
      winRate: 0.2,
      top3Rate: 0.45,
      avgPlacement: 3.9,
      avgKills: 2,
      avgAssists: 5,
      avgDeaths: 2,
      avgTeamKills: 10,
      avgDamage: 8000,
    })
    const result = applyCharacterPerformanceGrades({
      rows: rows as never,
      characterStats: [{ characterNum: 69, games: 69, wins: 14, winRate: 20, avgRank: 3.9, kills: 138, assists: 345, deaths: 138, kda: 3.5, avgTeamKills: 10, avgKills: 2, avgDamage: 8000, gradeLabel: null }],
      metaStatus: 'complete',
      playerTier: getRankTierFromRp(6200),
    })
    expect(result[0]?.gradeStatus).toBe('ok')
    expect(['A', 'A+', 'A-', 'S-', 'S', 'B+', 'B']).toContain(result[0]?.grade)
  })

  it('랭크 10경기 + 코발트 5경기는 랭크 10경기만 grade 표본으로 사용', () => {
    const rankRows = buildMatchesFromStats({
      characterNum: 1,
      weaponTypeId: 14,
      count: 10,
      winRate: 0.5,
      top3Rate: 0.5,
      avgPlacement: 3,
      avgKills: 4,
      avgAssists: 3,
      avgDeaths: 2,
      avgTeamKills: 9,
      avgDamage: 12000,
    })
    const cobaltRows = buildMatchesFromStats({
      characterNum: 1,
      weaponTypeId: 14,
      count: 5,
      winRate: 1,
      top3Rate: 1,
      avgPlacement: 1,
      avgKills: 20,
      avgAssists: 20,
      avgDeaths: 0,
      avgTeamKills: 40,
      avgDamage: 50000,
    }).map((row) => ({ ...row, gameMode: 'cobalt' }))

    const result = applyCharacterPerformanceGrades({
      rows: [...rankRows, ...cobaltRows] as never,
      characterStats: [
        {
          characterNum: 1,
          games: 15,
          wins: 10,
          winRate: 66.67,
          avgRank: 2.3,
          kills: 140,
          assists: 130,
          deaths: 20,
          kda: 13.5,
          avgTeamKills: 19.33,
          avgKills: 9.33,
          avgDamage: 24666,
          gradeLabel: null,
        },
      ],
      metaStatus: 'complete',
      playerTier: getRankTierFromRp(4200),
    })

    expect(result[0]?.gradeStatus).toBe('ok')
    expect(result[0]?.gradeSampleSize).toBe(10)
  })
})

describe('computeMatchPerformanceGrade', () => {
  const baseRow = {
    characterNum: 1,
    bestWeapon: 14,
    placement: 4,
    kills: 2,
    assists: 2,
    deaths: 2,
    teamKills: 7,
    damageToPlayer: 10_000,
    victory: false,
    roleMetricsVersion: null,
    viewContribution: null,
    monsterKill: null,
    damageFromPlayer: null,
    shieldDamageOffsetFromPlayer: null,
    teamRecover: null,
  }

  it('same match record is calibrated differently by player tier', () => {
    const gold = computeMatchPerformanceGrade({
      row: baseRow,
      playerTier: getRankTierFromRp(1800),
      displaySeasonId: 11,
    })
    const meteorite = computeMatchPerformanceGrade({
      row: baseRow,
      playerTier: getRankTierFromRp(6200),
      displaySeasonId: 11,
    })

    expect(gold.matchGrade).toMatch(/^[SABCD][+-]?$/)
    expect(meteorite.matchGrade).toMatch(/^[SABCD][+-]?$/)
    expect(gold.matchGradeScore).not.toBe(meteorite.matchGradeScore)
  })

  it('same stat line is calibrated differently by character and weapon role', () => {
    const yuki = computeMatchPerformanceGrade({
      row: baseRow,
      playerTier: getRankTierFromRp(6200),
      displaySeasonId: 11,
    })
    const charlotte = computeMatchPerformanceGrade({
      row: { ...baseRow, characterNum: 73, bestWeapon: 24 },
      playerTier: getRankTierFromRp(6200),
      displaySeasonId: 11,
    })

    expect(yuki.matchGradeScore).not.toBe(charlotte.matchGradeScore)
    expect(charlotte.matchGradeRole).toBe('서포터')
  })

  it('uses lower-is-better placement normalization', () => {
    const first = computeMatchPerformanceGrade({
      row: { ...baseRow, placement: 1 },
      playerTier: getRankTierFromRp(4200),
      displaySeasonId: 11,
    })
    const eighth = computeMatchPerformanceGrade({
      row: { ...baseRow, placement: 8, victory: false },
      playerTier: getRankTierFromRp(4200),
      displaySeasonId: 11,
    })

    expect(first.matchGradeScore).not.toBeNull()
    expect(eighth.matchGradeScore).not.toBeNull()
    expect(first.matchGradeScore ?? 0).toBeGreaterThan(eighth.matchGradeScore ?? 0)
  })

  it('falls back to no grade when tier or baseline identity is missing', () => {
    const missingTier = computeMatchPerformanceGrade({
      row: baseRow,
      playerTier: null,
      displaySeasonId: 11,
    })
    const missingBaseline = computeMatchPerformanceGrade({
      row: { ...baseRow, characterNum: 999, bestWeapon: 999 },
      playerTier: getRankTierFromRp(4200),
      displaySeasonId: 11,
    })

    expect(missingTier.matchGrade).toBeNull()
    expect(missingBaseline.matchGrade).toBeNull()
  })

  it('keeps grade computable with missing optional metrics and teamKill zero', () => {
    const result = computeMatchPerformanceGrade({
      row: {
        ...baseRow,
        teamKills: 0,
        damageToPlayer: null,
        viewContribution: null,
        monsterKill: null,
      },
      playerTier: getRankTierFromRp(4200),
      displaySeasonId: 11,
    })

    expect(result.matchGrade).toMatch(/^[SABCD][+-]?$/)
    expect(result.matchGradeScore).not.toBeNull()
  })

  it('코발트와 알 수 없는 mode는 경기 grade를 계산하지 않음', () => {
    const cobalt = computeMatchPerformanceGrade({
      row: { ...baseRow, gameMode: 'cobalt' },
      playerTier: getRankTierFromRp(4200),
      displaySeasonId: 11,
    })
    const unknown = computeMatchPerformanceGrade({
      row: { ...baseRow, gameMode: 'arcade' },
      playerTier: getRankTierFromRp(4200),
      displaySeasonId: 11,
    })

    expect(cobalt.matchGrade).toBeNull()
    expect(cobalt.matchGradeScore).toBeNull()
    expect(unknown.matchGrade).toBeNull()
    expect(unknown.matchGradeScore).toBeNull()
  })

  it('rank 경기 최종 점수는 v3 direct roleScore + placement 보정을 적용한다', () => {
    const row = { ...baseRow, gameMode: 'rank', gameDuration: 1200 }
    const playerTier = getRankTierFromRp(4200)
    const v3 = computeMatchPerformanceGrade({
      row,
      playerTier,
      displaySeasonId: 11,
    })

    expect(v3.matchGradeRoleScore).not.toBeNull()
    expect(v3.matchGradeOutcomeScore).toBeNull()
    expect(v3.matchGradeScore).toBeCloseTo(
      (v3.matchGradeRoleScore ?? 0) +
        (roleScoreV3PlacementAdjustment({
          placement: row.placement,
          roleScore: v3.matchGradeRoleScore,
        }) ?? 0),
      2,
    )
    expect(v3.matchGrade).toMatch(/^[SABCD][+-]?$/)
  })
})

describe('charlotte manual calculation fixture', () => {
  it('샬럿 outcome 지표 수동 계산표', () => {
    const baseline = lookupBaselineForCombination(METEORITE_PLUS, 73, 24)
    expect(baseline).not.toBeNull()

    const playerWinRate = 0.1875
    const playerTop3 = 0.375
    const playerPlace = 4.2

    const tierWin = baseline!.metrics.winRate
    const tierTop3 = baseline!.metrics.top3Rate
    const tierPlace = baseline!.metrics.averagePlace

    const winScore = robustNormalizeMetricScore({
      playerValue: playerWinRate,
      tierValue: tierWin,
      eliteCandidates: [
        { tierKey: 'in1000', value: 0.13513513513513514, count: 37 },
        { tierKey: 'mithril_plus', value: 0.16791979949874686, count: 399 },
      ],
      higherBetter: true,
      metricKey: 'winRate',
    })

    const top3Score = robustNormalizeMetricScore({
      playerValue: playerTop3,
      tierValue: tierTop3,
      eliteCandidates: [
        { tierKey: 'in1000', value: 0.2972972972972973, count: 37 },
        { tierKey: 'mithril_plus', value: 0.3558897243107769, count: 399 },
      ],
      higherBetter: true,
      metricKey: 'top3Rate',
    })

    const placeScore = robustNormalizeMetricScore({
      playerValue: playerPlace,
      tierValue: tierPlace,
      eliteCandidates: [
        { tierKey: 'in1000', value: 4.5675675675675675, count: 37 },
        { tierKey: 'mithril_plus', value: 4.4035087719298245, count: 399 },
      ],
      higherBetter: false,
      metricKey: 'averagePlace',
    })

    const outcomeScore = weightedScore([
      { score: winScore.score!, weight: 30 },
      { score: top3Score.score!, weight: 30 },
      { score: placeScore.score!, weight: 40 },
    ])!

    const rows = buildMatchesFromStats({
      characterNum: 73,
      weaponTypeId: 24,
      count: 32,
      winRate: playerWinRate,
      top3Rate: playerTop3,
      avgPlacement: playerPlace,
    })
    const stats = aggregateWeaponGroupStats(73, 24, rows.map((row) => ({
      placement: row.placement,
      kills: row.kills,
      assists: row.assists,
      deaths: row.deaths,
      teamKills: row.teamKills,
      damageToPlayer: row.damageToPlayer,
      visionScore: null,
      visionFromStructured: false,
      animalKills: null,
      animalKillsFromStructured: false,
      roleMetricsVersion: null,
      damageFromPlayer: null,
      damageFromPlayerFromStructured: false,
      shieldDamageOffsetFromPlayer: null,
      shieldFromStructured: false,
      teamRecover: null,
      teamRecoverFromStructured: false,
      victory: row.victory,
      weaponTypeId: 24,
    })))
    const scored = computeWeaponGroupScore(stats!, '서포터', METEORITE_PLUS)

    expect(winScore.mode).toBe('alternate-elite')
    expect(top3Score.mode).toBe('tier-only')
    expect(placeScore.mode).toBe('tier-only')
    expect(outcomeScore).toBeGreaterThan(60)
    expect(scored?.rawScore).toBeGreaterThan(60)

    const rawScore = scored!.rawScore
    const confidenceAdjusted = applySampleConfidence(rawScore, 32)
    const finalGrade = scoreToFineGrade(confidenceAdjusted)

    expect(finalGrade).not.toBeNull()
    expect(scored?.gradeFallbackMetricCount).toBeGreaterThan(0)
  })
})
