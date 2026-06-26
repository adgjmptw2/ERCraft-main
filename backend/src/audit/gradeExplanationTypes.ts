import type { EffectiveReadinessLevel } from './roleMetricCalibration.js'

export type GradeExplanationMetricKey =
  | 'winRate'
  | 'top3Rate'
  | 'averagePlacement'
  | 'damageToPlayer'
  | 'kills'
  | 'assists'
  | 'teamKills'
  | 'deaths'
  | 'viewContribution'
  | 'monsterKill'
  | 'combatContribution'
  | 'finisherShare'
  | 'tankingEfficiency'
  | 'shieldDamageOffsetFromPlayer'
  | 'teamRecover'
  | 'tankingUtility'
  | 'supportUtility'

export type GradeBaselineSource = 'dakgg-static-snapshot' | 'ercraft-aggregated-official-bser' | null

export interface GradeMetricExplanation {
  metric: GradeExplanationMetricKey
  enabled: boolean
  exclusionReason: string | null
  weight: number
  configuredWeight: number
  enabledWeight: number
  effectiveWeightAfterNormalization: number
  userValue: number | null
  baselineValue: number | null
  upperAnchorValue: number | null
  baselineTier: string | null
  baselineSource: GradeBaselineSource
  normalizedScore: number | null
  weightedContribution: number | null
  weightedContributionBeforeNormalization: number | null
  weightedContributionAfterNormalization: number | null
  sampleCount: number | null
  coverage: number | null
  readiness: EffectiveReadinessLevel | null
  usedFallback: boolean
  fallbackReason: string | null
}

export interface GradeScoreSectionExplanation {
  weight: number
  score: number | null
  presetId: string
  enabledWeightTotal: number
  configuredWeightTotal: number
  effectiveWeightTotal: number
  metrics: GradeMetricExplanation[]
}

export interface CharacterGradeExplanation {
  characterNum: number
  weaponTypeId: number
  role: string
  supportSubtype: 'healer' | 'utility' | null

  matchCount: number
  finalGrade: string | null
  finalScore: number | null
  rawScoreBeforeConfidence: number | null
  confidenceFactor: number | null

  outcome: GradeScoreSectionExplanation
  roleScore: GradeScoreSectionExplanation

  modes: {
    roleMetricMode: string
    combatMetricMode: string
  }

  presetCompleteness: {
    complete: boolean
    missingMetrics: string[]
    configuredWeightTotal: number
    enabledWeightTotal: number
    effectiveWeightTotal: number
  }

  fallback: {
    used: boolean
    reasons: string[]
  }

  baselineMetadata: {
    dakSnapshotGeneratedAt: string | null
    dakPeriodDays: number | null
    combatGeneratedAt: string | null
    combatPlayedAtFrom: string | null
    combatPlayedAtTo: string | null
    combatParticipantRowCount: number | null
    combatUniqueGameCount: number | null
    baselinePeriodGapDays: number | null
    baselinePeriodWarning: boolean
  }

  comparison: {
    legacyRawScore: number | null
    legacyGrade: string | null
    legacyRoleScore: number | null
    legacyRoleMetrics: GradeMetricExplanation[]
    combatRawScore: number | null
    combatGrade: string | null
    combatRoleScore: number | null
    hRoleRawScore: number | null
    hRoleGrade: string | null
    hRoleScore: number | null
    liveRawScore: number | null
    liveGrade: string | null
    scoreDelta: number | null
    gradeStepDelta: number | null
  }
}

export interface WeaponGroupComparisonRow {
  anonymousProfileId: string
  characterNum: number
  weaponTypeId: number
  role: string
  playerTierKey: string
  exactKey: string
  matchCount: number
  legacyRawScore: number | null
  liveRawScore: number | null
  legacyGrade: string | null
  liveGrade: string | null
  scoreDelta: number | null
  gradeStepDelta: number | null
  coarseChanged: boolean
  combatApplied: boolean
  combatMode: string
  roleMetricMode: string
  combatFallbackReason: string | null
}

export interface RolloutAuditSummary {
  generatedAt: string
  appliedGroupCount: number
  legacyGroupCount: number
  meanScoreDelta: number | null
  medianScoreDelta: number | null
  meanAbsScoreDelta: number | null
  p90AbsScoreDelta: number | null
  p95AbsScoreDelta: number | null
  maxIncrease: number | null
  maxDecrease: number | null
  maxAbsScoreDelta: number | null
  sameGradeRate: number | null
  oneStepChangeRate: number | null
  twoPlusStepChangeRate: number | null
  coarseBucketChangeRate: number | null
}
