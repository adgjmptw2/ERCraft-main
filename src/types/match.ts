import type { GameMode } from '@/utils/gameMode'
import type { EquipmentItemGrade } from '@/utils/equipmentItemGrade'

/** Fankit 검증 slug만 UI에 노출 — mock/API optional */
export interface MatchEquipmentGearPreview {
  /** 5 — 완성 무기 아이템 */
  weapon?: string
  /** 6 — 상의 */
  chest?: string
  /** 7 — 머리 */
  head?: string
  /** 8 — 팔/액세서리 */
  arm?: string
  /** 9 — 신발 */
  leg?: string
}

/** 슬롯별 장비 등급 (전설·영웅·혈액 배경색) */
export interface MatchEquipmentGearGrades {
  weapon?: EquipmentItemGrade
  chest?: EquipmentItemGrade
  head?: EquipmentItemGrade
  arm?: EquipmentItemGrade
  leg?: EquipmentItemGrade
}

export interface MatchEquipmentPreview {
  /** 1 — 무기 종류 (weapons/weapon-group/arcana 등) */
  weaponTypeSlug?: string
  /** 2 — 전술 스킬 (tactical-skills/blink 등) */
  tacticalSkillSlug?: string
  /** 3 — 메인 특성 */
  mainTraitSlug?: string
  /** 4 — 보조 특성 트리 그룹 아이콘 (저항·혼돈 등) */
  subTraitSlug?: string
  /** 5~9 — 장비 슬롯 */
  gear?: MatchEquipmentGearPreview
  gearGrade?: MatchEquipmentGearGrades
}

export interface TeamPerformance {
  status: 'ready' | 'partial' | 'unavailable'
  reason?:
    | 'missing-team-number'
    | 'missing-participants'
    | 'missing-teammates'
    | 'missing-grade-input'
    | 'partial-one-teammate'
    | 'unsupported-mode'
  teammateCount: number
  gradedTeammateCount: number
  ownPerformanceScore: number | null
  teammatePerformanceScore: number | null
  teammatePerformanceDelta: number | null
  teammatePerformanceLabel: string | null
  carryBurdenDelta: number | null
  carryBurdenLabel: string | null
  teamMetricVersion?: string
  residualBaselineVersion?: string
  benchmarkVersion?: string
  teamLuckResidual?: number | null
  teamLuckLabel?: '최상' | '좋음' | '보통' | '나쁨' | '최악' | null
  ownResidual?: number | null
  ownRolePerformanceScore?: number | null
  expectedRolePerformanceScore?: number | null
  teammateResidualAverage?: number | null
  carryBurdenResidual?: number | null
  confidence?: 'high' | 'medium' | 'low'
  fallbackLevel?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | null
  sampleCount?: number | null
}

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  hasNext: boolean
}

export interface MatchSummary {
  matchId: string
  userNum: number
  characterNum?: number
  characterName: string
  placement: number
  kills: number
  deaths: number
  assists: number
  gameStartedAt: string
  victory: boolean
  seasonNumber?: number
  rpAfter?: number
  rpDelta?: number
  /** 게임 플레이 시간(초). mock 미지정 시 matchId 시드로 1200~2400 생성 */
  gameDuration?: number | null
  /** 플레이어 딜량 */
  playerDamage?: number | null
  /** 동물(몬스터) 딜량 */
  monsterDamage?: number | null
  /** 획득 크레딧 */
  credit?: number | null
  /** 팀 킬 (데모 optional) */
  teamKills?: number | null
  /** 플레이어 대상 딜량 (데모 optional) */
  damageToPlayers?: number | null
  /** 시야 점수 (데모 optional) */
  visionScore?: number | null
  /** 동물 킬 (데모 optional) */
  animalKills?: number | null
  /** 랭크 · 코발트 · 유니온 · 일반 */
  gameMode?: GameMode
  accountLevel?: number | null
  characterLevel?: number | null
  skinCode?: number
  bestWeapon?: number
  tacticalSkillGroup?: number
  traitFirstCore?: number
  traitFirstSub?: number[]
  traitSecondSub?: number[]
  equipment?: number[] | Record<string, number>
  equipmentGrade?: number[] | Record<string, number>
  routeIdOfStart?: number
  /** -1이면 미공개 루트 */
  routeSlotId?: number
  /** Cobalt Protocol — FinalInfusion (최대 3) */
  cobaltInfusions?: number[]
  equipmentPreview?: MatchEquipmentPreview
  matchGrade?: string | null
  matchGradeScore?: number | null
  matchGradeBaselineTierKey?: string | null
  matchGradeRole?: string | null
  matchGradeUsedFallback?: boolean
  matchGradeFallback?: {
    used: boolean
    baselineLevel: string
    normalization: string
    combat: string
    reasons: string[]
  }
  matchGradeOutcomeScore?: number | null
  matchGradeRoleScore?: number | null
  matchGradeDamageEvidence?: {
    actualDamage: number | null
    baselineDamage: number | null
    oldExpectedDamage: number | null
    expectedDamage: number | null
    oldMultiplier: number | null
    globalMultiplier: number | null
    finalMultiplier: number | null
    damageRatio: number | null
    damageScore: number | null
    weightedContribution: number | null
    rawMetricScore?: number | null
    adjustedMetricScore?: number | null
    rawWeightedContribution?: number | null
    adjustedWeightedContribution?: number | null
    adjustmentPolicy?: string
    durationPolicy: string
    presetVersion: string
  }
  matchGradeMetricEvidence?: Array<{
    metric: string
    actualValue: number | null
    expectedValue: number | null
    ratio: number | null
    rawMetricScore: number | null
    adjustedMetricScore: number | null
    adjustmentPolicy: string
    weight: number
    rawWeightedContribution: number | null
    adjustedWeightedContribution: number | null
    metricPresetVersion: string
  }>
  teamPerformance?: TeamPerformance
}

export interface MatchDetail extends MatchSummary {
  damageToPlayers?: number
  visionScore?: number
}

export interface MatchSummaryDTO extends MatchSummary {
  gameMode: GameMode
  gameModeLabel: string
  kdaString: string
  placementLabel: string
  relativeTime: string
  gameDuration: number | null
  gameDurationLabel: string
  teamKill: number | null
  playerDamage: number | null
  rpDeltaValue: number | null
  matchGrade: string | null
  teamLuck: 'good' | 'normal' | 'bad' | null
  teamLuckLabel: string
  teamLuckIcon: string
  routeLabel: string
  characterLevel: number | null
  equipmentPreview?: MatchEquipmentPreview
}
