import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  deterministicGeneratedAtForTest,
  formatGradeExplainabilityText,
  type GradeExplainabilityReport,
} from './gradeExplainabilityReport.js'

const baseReport: GradeExplainabilityReport = {
  schemaVersion: 1,
  generatedAt: deterministicGeneratedAtForTest,
  player: {
    requestedNickname: '테스트',
    resolvedNickname: '테스트',
    canonicalUserNum: 1,
    canonicalUid: 'uid',
    identitySource: 'test',
    verifiedSourceUids: ['uid'],
  },
  scope: {
    seasonId: 11,
    apiSeasonId: 39,
    matchMode: 'rank',
    currentTier: '메테오라이트',
    tierKey: 'meteorite_plus',
    totalRankMatches: 10,
    aggregateMatchCount: 10,
    gradedMatchCount: 10,
  },
  versions: {
    benchmarkVersion: 'tier-baselines.v1-fixed-legacy.v1',
    metricPresetVersion: 'grade-calibration.v2',
    gradeCalibrationVersion: 'grade-calibration.v2',
    roleArtifactVersion: 'character-weapon-roles.v1',
    combatArtifactVersion: 'combat-participation-baselines.v1',
    snapshotVersion: 'character-grade-snapshot.v1',
  },
  snapshot: {
    status: 'ready',
    fingerprint: 'abc',
    computedAt: deterministicGeneratedAtForTest,
    sourceUpdatedAt: null,
    rowCount: 1,
    gradedRowCount: 1,
    stale: false,
  },
  overallGrade: {
    score: 65,
    grade: 'B',
    source: 'character-grade-weighted-average',
    gradedCharacterCount: 1,
    totalCharacterCount: 1,
    weightedMatchCount: 10,
    totalRankMatchCount: 10,
    excludedMatchCount: 0,
    weightedScoreSum: 650,
    formula: 'overallPerformanceScore = Σ(character.gradeScore × character.matchCount) / Σ(included character.matchCount)',
    characterContributions: [
      {
        characterNum: 1,
        characterName: '테스트캐릭터',
        weaponTypeId: 1,
        weaponType: '글러브',
        rolePreset: '평타 브루저',
        matchCount: 10,
        gradeScore: 65,
        grade: 'B',
        weightedContribution: 650,
        shareOfDenominator: 1,
        shareOfWeightedScore: 1,
        included: true,
        excludedReason: null,
      },
    ],
  },
  characterGrades: [],
  ungradedCharacters: [],
  matchGradeSamples: [],
  distributionDiagnostics: {
    baselineCenter: {
      normalizeCenterScore: 65,
      bThreshold: 62,
      gradeAtCenter: 'B',
      interpretation: 'center maps to B',
    },
    gradeDistribution: { B: 1 },
    bOrAboveRatio: 1,
    confidence: {
      rowsRaised: 0,
      rowsLowered: 0,
      rowsUnchanged: 1,
      averageBefore: 65,
      averageAfter: 65,
      averageDelta: 0,
    },
    excludedRows: {
      totalRows: 1,
      gradedRows: 1,
      ungradedRows: 0,
      excludedMatchCount: 0,
      totalMatchCount: 10,
      excludedMatchRatio: 0,
    },
    fallback: {
      byBaselineLevel: {},
      byNormalization: {},
      byCombat: {},
    },
    mainCharacterWeight: {
      top1DenominatorShare: 1,
      top3DenominatorShare: 1,
      top5DenominatorShare: 1,
    },
    conclusion: ['normalize score, not empirical rank'],
  },
  warnings: [],
}

describe('gradeExplainabilityReport', () => {
  it('formats normalized score without percentile wording', () => {
    const text = formatGradeExplainabilityText(baseReport)
    expect(text).toContain('최종 성과 점수')
    expect(text).not.toContain('백분위')
    expect(JSON.stringify(baseReport)).not.toContain('percentile')
  })

  it('keeps overall formula auditable', () => {
    const contribution = baseReport.overallGrade.characterContributions[0]
    expect(contribution.gradeScore! * contribution.matchCount).toBe(
      contribution.weightedContribution,
    )
    expect(baseReport.overallGrade.weightedScoreSum / baseReport.overallGrade.weightedMatchCount).toBe(
      baseReport.overallGrade.score,
    )
  })

  it('documents Overall V2 as player-season benchmark, not implementation', () => {
    const doc = readFileSync(
      join(process.cwd(), '..', 'docs', 'design', 'OVERALL_GRADE_V2_SPEC.md'),
      'utf8',
    )
    expect(doc).toContain('player-season benchmark')
    expect(doc).toContain('Outcome Performance * 30%')
    expect(doc).toContain('Do not replace the production overall grade')
  })

  it('documents team luck separately from carry burden', () => {
    const doc = readFileSync(
      join(process.cwd(), '..', 'docs', 'design', 'TEAM_METRICS_SPEC.md'),
      'utf8',
    )
    expect(doc).toContain('Matchmaking luck')
    expect(doc).toContain('Carry burden')
    expect(doc).toContain('Do not call these metrics team luck')
  })
})
