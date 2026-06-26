import type { MatchSummary } from '@/types/match'
import { deriveMatchSetMetrics, type MatchSetDerivedMetrics } from '@/analysis/playStyleMetrics'
import {
  ANALYSIS_AXES,
  ANALYSIS_AXIS_LABELS,
  PLAYER_ROLE_LABELS,
  PLAYER_ROLES,
  type AnalysisAxis,
  type AxisScores,
  type PlayStyleRole,
  type PlayerPlayStyleAnalysis,
  type PlayerRole,
  type RoleFitScores,
} from '@/analysis/playStyleTypes'
import { calculatePercentileRank, clampPercentile, mean } from '@/analysis/percentile'
import { resolveCharacterDisplayName } from '@/utils/gameLabels'

const MIN_SAMPLE = 3

export const ROLE_AXIS_WEIGHTS: Record<PlayerRole, Record<AnalysisAxis, number>> = {
  basicAttackDealer: { survival: 15, combat: 30, macro: 20, support: 5, finish: 20, consistency: 10 },
  skillAmpDealer: { survival: 15, combat: 30, macro: 20, support: 5, finish: 20, consistency: 10 },
  bruiser: { survival: 25, combat: 25, macro: 20, support: 10, finish: 10, consistency: 10 },
  support: { survival: 20, combat: 10, macro: 10, support: 40, finish: 10, consistency: 10 },
  tank: { survival: 30, combat: 10, macro: 15, support: 30, finish: 5, consistency: 10 },
  assassin: { survival: 10, combat: 35, macro: 15, support: 5, finish: 25, consistency: 10 },
}

const CHARACTER_PLAY_STYLE_ROLE: Record<string, PlayerRole> = {
  Yuki: 'basicAttackDealer',
  유키: 'basicAttackDealer',
  Fiona: 'basicAttackDealer',
  피오라: 'basicAttackDealer',
  Rio: 'basicAttackDealer',
  리오: 'basicAttackDealer',
  Rozzi: 'basicAttackDealer',
  로지: 'basicAttackDealer',
  Piolo: 'bruiser',
  피올로: 'bruiser',
  Jackie: 'bruiser',
  재키: 'bruiser',
  Jan: 'bruiser',
  얀: 'bruiser',
  Felix: 'bruiser',
  펠릭스: 'bruiser',
  'Li Dailin': 'bruiser',
  LiDailin: 'bruiser',
  '리 다이린': 'bruiser',
  리다이린: 'bruiser',
  Silvia: 'bruiser',
  실비아: 'bruiser',
  Adela: 'skillAmpDealer',
  아델라: 'skillAmpDealer',
  Hyejin: 'skillAmpDealer',
  혜진: 'skillAmpDealer',
  Isol: 'skillAmpDealer',
  아이솔: 'skillAmpDealer',
  Hayes: 'skillAmpDealer',
  Haze: 'skillAmpDealer',
  헤이즈: 'skillAmpDealer',
  Emma: 'skillAmpDealer',
  엠마: 'skillAmpDealer',
  Arda: 'skillAmpDealer',
  아르다: 'skillAmpDealer',
  Aya: 'assassin',
  아야: 'assassin',
  Lenny: 'support',
  Leni: 'support',
  레니: 'support',
  Hart: 'tank',
  하트: 'tank',
  Magnus: 'tank',
  매그너스: 'tank',
}

interface WeightedInput {
  key: string
  weight: number
  value: number | null
  higherIsBetter: boolean
  population: number[]
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return clampPercentile(value)
}

function normalizeCharacterKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function lookupCharacterRole(name: string): PlayerRole | null {
  const key = normalizeCharacterKey(name)
  if (!key) return null
  return CHARACTER_PLAY_STYLE_ROLE[key] ?? CHARACTER_PLAY_STYLE_ROLE[key.replace(/\s+/g, '')] ?? null
}

function resolveMatchRole(match: MatchSummary): PlayerRole | null {
  return (
    lookupCharacterRole(match.characterName) ??
    lookupCharacterRole(resolveCharacterDisplayName(match.characterNum, match.characterName))
  )
}

function metricScore(input: WeightedInput): number | null {
  if (input.value == null || input.population.length === 0) return null
  return calculatePercentileRank({
    value: input.value,
    populationValues: input.population,
    higherIsBetter: input.higherIsBetter,
  })
}

function weightedAxisScore(inputs: WeightedInput[]): { score: number | null; unavailable: string[] } {
  const unavailable = inputs
    .filter((item) => item.value == null || item.population.length === 0)
    .map((item) => item.key)
  const available = inputs.filter((item) => item.value != null && item.population.length > 0)
  if (available.length === 0) {
    return { score: null, unavailable: inputs.map((item) => item.key) }
  }
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0)
  let weighted = 0
  for (const item of available) {
    const score = metricScore(item)
    if (score == null) continue
    weighted += score * (item.weight / totalWeight)
  }
  return { score: clampScore(weighted), unavailable }
}

function populationColumn(
  snapshots: MatchSetDerivedMetrics[],
  pick: (metrics: MatchSetDerivedMetrics) => number | null,
): number[] {
  return snapshots
    .map(pick)
    .filter((value): value is number => value != null && Number.isFinite(value))
}

function buildRoleDistribution(matches: MatchSummary[]): Record<PlayerRole, number> {
  const counts = Object.fromEntries(PLAYER_ROLES.map((role) => [role, 0])) as Record<PlayerRole, number>
  let known = 0
  for (const match of matches) {
    const role = resolveMatchRole(match)
    if (!role) continue
    counts[role] += 1
    known += 1
  }
  if (known === 0) return counts
  for (const role of PLAYER_ROLES) counts[role] = counts[role] / known
  return counts
}

/**
 * [계산 방식 2단계] 최근 경기 포지션 분포로 1단계 축 가중치를 합산.
 * 예) 평타딜러 40% / 서폿 40% / 탱커 20% → 생존 = 0.4×15 + 0.4×20 + 0.2×30 = 20
 */
export function blendAxisWeights(
  roleDistribution: Record<PlayerRole, number>,
): Record<AnalysisAxis, number> {
  const blended = Object.fromEntries(ANALYSIS_AXES.map((axis) => [axis, 0])) as Record<
    AnalysisAxis,
    number
  >
  const knownShare = PLAYER_ROLES.reduce((sum, role) => sum + roleDistribution[role], 0)

  if (knownShare <= 0) {
    // 포지션 미상 캐릭터만 있을 때 — 전 포지션 평균 가중치
    for (const axis of ANALYSIS_AXES) {
      blended[axis] =
        PLAYER_ROLES.reduce((sum, role) => sum + ROLE_AXIS_WEIGHTS[role][axis], 0) /
        PLAYER_ROLES.length
    }
    return blended
  }

  for (const role of PLAYER_ROLES) {
    const share = roleDistribution[role] / knownShare
    if (share <= 0) continue
    for (const axis of ANALYSIS_AXES) {
      blended[axis] += ROLE_AXIS_WEIGHTS[role][axis] * share
    }
  }
  return blended
}

/** [계산 방식 3단계] 합산 가중치 × 축 점수 → 종합 점수 */
function weightedOverallScore(
  axisScores: AxisScores,
  axisWeights: Record<AnalysisAxis, number>,
): number | null {
  let totalWeight = 0
  let weighted = 0
  for (const axis of ANALYSIS_AXES) {
    const score = axisScores[axis]
    if (score == null) continue
    totalWeight += axisWeights[axis]
    weighted += score * axisWeights[axis]
  }
  if (totalWeight <= 0) return null
  return Math.round(weighted / totalWeight)
}

// [2단계] 세부 지표 가중치 — 포지션 공통
function computeAxisScores(
  metrics: MatchSetDerivedMetrics,
  population: MatchSetDerivedMetrics[],
): { scores: AxisScores; unavailable: string[] } {
  const unavailable: string[] = []
  const scores: AxisScores = {}

  // 생존: 평균 등수 35 / TOP3 30 / 평균 데스 20 / 하위권(7등↓) 15
  const survival = weightedAxisScore([
    { key: 'avgPlacement', weight: 35, value: metrics.avgPlacement, higherIsBetter: false, population: populationColumn(population, (p) => p.avgPlacement) },
    { key: 'top3Rate', weight: 30, value: metrics.top3Rate, higherIsBetter: true, population: populationColumn(population, (p) => p.top3Rate) },
    { key: 'avgDeaths', weight: 20, value: metrics.avgDeaths, higherIsBetter: false, population: populationColumn(population, (p) => p.avgDeaths) },
    { key: 'bottomRate', weight: 15, value: metrics.bottomRate, higherIsBetter: false, population: populationColumn(population, (p) => p.bottomRate) },
  ])
  if (survival.score != null) scores.survival = survival.score
  unavailable.push(...survival.unavailable)

  // 교전: 사람 딜량 40 / 평균 킬 35 / 평균 어시 25
  const combat = weightedAxisScore([
    { key: 'personDamage', weight: 40, value: metrics.avgPersonDamage, higherIsBetter: true, population: populationColumn(population, (p) => p.avgPersonDamage) },
    { key: 'avgKills', weight: 35, value: metrics.avgKills, higherIsBetter: true, population: populationColumn(population, (p) => p.avgKills) },
    { key: 'avgAssists', weight: 25, value: metrics.avgAssists, higherIsBetter: true, population: populationColumn(population, (p) => p.avgAssists) },
  ])
  if (combat.score != null) scores.combat = combat.score
  unavailable.push(...combat.unavailable)

  // 운영: 크레딧 효율 30 / 동물 딜량 30 / 평균 생존시간 25 / 아이템 완성도 15
  // 동물 딜량(damageToMonster) 우선, 없으면 동물 처치 수로 대체
  const animalDamageValue =
    metrics.avgMonsterDamage != null ? metrics.avgMonsterDamage : metrics.avgAnimalKills
  const animalDamagePopulation =
    metrics.avgMonsterDamage != null
      ? populationColumn(population, (p) => p.avgMonsterDamage)
      : populationColumn(population, (p) => p.avgAnimalKills)

  const macro = weightedAxisScore([
    { key: 'creditEfficiency', weight: 30, value: metrics.creditEfficiency, higherIsBetter: true, population: populationColumn(population, (p) => p.creditEfficiency) },
    { key: 'animalDamage', weight: 30, value: animalDamageValue, higherIsBetter: true, population: animalDamagePopulation },
    { key: 'avgSurvivalSeconds', weight: 25, value: metrics.avgSurvivalSeconds, higherIsBetter: true, population: populationColumn(population, (p) => p.avgSurvivalSeconds) },
    { key: 'itemCompletion', weight: 15, value: metrics.itemCompletion, higherIsBetter: true, population: populationColumn(population, (p) => p.itemCompletion) },
  ])
  if (macro.score != null) scores.macro = macro.score
  unavailable.push(...macro.unavailable)

  // 지원: 평균 시야 75 / TK 관여율 25
  const support = weightedAxisScore([
    { key: 'avgVision', weight: 75, value: metrics.avgVision, higherIsBetter: true, population: populationColumn(population, (p) => p.avgVision) },
    { key: 'tkInvolvement', weight: 25, value: metrics.tkInvolvementRate, higherIsBetter: true, population: populationColumn(population, (p) => p.tkInvolvementRate) },
  ])
  if (support.score != null) scores.support = support.score
  unavailable.push(...support.unavailable)

  // 마무리: 승률 35 / TOP2 30 / 평균 등수 20 / 후반 전환율 15
  const finish = weightedAxisScore([
    { key: 'winRate', weight: 35, value: metrics.winRate, higherIsBetter: true, population: populationColumn(population, (p) => p.winRate) },
    { key: 'top2Rate', weight: 30, value: metrics.top2Rate, higherIsBetter: true, population: populationColumn(population, (p) => p.top2Rate) },
    { key: 'avgPlacement', weight: 20, value: metrics.avgPlacement, higherIsBetter: false, population: populationColumn(population, (p) => p.avgPlacement) },
    { key: 'lateTransitionDelta', weight: 15, value: metrics.lateTransitionDelta, higherIsBetter: true, population: populationColumn(population, (p) => p.lateTransitionDelta) },
  ])
  if (finish.score != null) scores.finish = finish.score
  unavailable.push(...finish.unavailable)

  const consistency = weightedAxisScore([
    { key: 'placementStdDev', weight: 40, value: metrics.placementStdDev, higherIsBetter: false, population: populationColumn(population, (p) => p.placementStdDev) },
    { key: 'halfPlacementGap', weight: 30, value: metrics.halfPlacementGap, higherIsBetter: false, population: populationColumn(population, (p) => p.halfPlacementGap) },
    { key: 'kdaCoefficientOfVariation', weight: 30, value: metrics.kdaCoefficientOfVariation, higherIsBetter: false, population: populationColumn(population, (p) => p.kdaCoefficientOfVariation) },
  ])
  if (consistency.score != null) scores.consistency = consistency.score
  unavailable.push(...consistency.unavailable)

  return { scores, unavailable: [...new Set(unavailable)] }
}

export function computeRoleFitScores(axisScores: AxisScores): RoleFitScores {
  const fit: RoleFitScores = {}
  for (const role of PLAYER_ROLES) {
    const weights = ROLE_AXIS_WEIGHTS[role]
    let totalWeight = 0
    let weighted = 0
    for (const axis of ANALYSIS_AXES) {
      const axisScore = axisScores[axis]
      if (axisScore == null) continue
      totalWeight += weights[axis]
      weighted += axisScore * weights[axis]
    }
    if (totalWeight > 0) fit[role] = clampScore(weighted / totalWeight)
  }
  return fit
}

function rankRoles(
  roleFit: RoleFitScores,
  roleDistribution: Record<PlayerRole, number>,
): { primary: PlayerRole | null; secondary: PlayerRole | null } {
  const ranked = PLAYER_ROLES.map((role, index) => ({
    role,
    score: roleFit[role] ?? -1,
    share: roleDistribution[role] ?? 0,
    order: index,
  }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.share !== a.share) return b.share - a.share
      return a.order - b.order
    })
  return { primary: ranked[0]?.role ?? null, secondary: ranked[1]?.role ?? null }
}

function averagePopulationMetrics(population: MatchSetDerivedMetrics[]): MatchSetDerivedMetrics | null {
  if (population.length === 0) return null
  const pick = <K extends keyof MatchSetDerivedMetrics>(key: K): MatchSetDerivedMetrics[K] | null => {
    const values = population.map((item) => item[key]).filter((value): value is Exclude<MatchSetDerivedMetrics[K], null> => value != null)
    if (values.length === 0) return null
    return (mean(values as number[]) ?? null) as MatchSetDerivedMetrics[K]
  }
  const avgPlacement = pick('avgPlacement')
  const avgDeaths = pick('avgDeaths')
  if (avgPlacement == null || avgDeaths == null) return null
  return {
    avgPlacement,
    top3Rate: pick('top3Rate') ?? 0,
    avgDeaths,
    bottomRate: pick('bottomRate') ?? 0,
    avgPersonDamage: pick('avgPersonDamage'),
    avgKills: pick('avgKills') ?? 0,
    tkInvolvementRate: pick('tkInvolvementRate'),
    avgAssists: pick('avgAssists') ?? 0,
    creditEfficiency: pick('creditEfficiency'),
    avgSurvivalSeconds: pick('avgSurvivalSeconds'),
    avgMonsterDamage: pick('avgMonsterDamage'),
    avgAnimalKills: pick('avgAnimalKills'),
    itemCompletion: pick('itemCompletion'),
    avgVision: pick('avgVision'),
    winRate: pick('winRate') ?? 0,
    top2Rate: pick('top2Rate') ?? 0,
    lateTransitionDelta: pick('lateTransitionDelta'),
    placementStdDev: pick('placementStdDev') ?? 0,
    halfPlacementGap: pick('halfPlacementGap') ?? 0,
    kdaCoefficientOfVariation: pick('kdaCoefficientOfVariation') ?? 0,
  }
}

function buildTierAverageAxes(population: MatchSetDerivedMetrics[], tierPopulation: MatchSetDerivedMetrics[]): AxisScores {
  const source = tierPopulation.length >= MIN_SAMPLE ? tierPopulation : population
  const avgMetrics = averagePopulationMetrics(source)
  if (!avgMetrics) return {}
  return computeAxisScores(avgMetrics, source).scores
}

function buildInsights(axisScores: AxisScores) {
  const entries = ANALYSIS_AXES.flatMap((axis) => {
    const score = axisScores[axis]
    return score == null ? [] : [{ axis, label: ANALYSIS_AXIS_LABELS[axis], score }]
  })
  if (entries.length === 0) {
    return { strengths: [] as string[], improvements: [] as string[], comment: '데이터 부족으로 요약을 표시할 수 없습니다.' }
  }
  const sorted = [...entries].sort((a, b) => b.score - a.score)
  return {
    strengths: sorted.slice(0, 2).map((item) => `${item.label} ${item.score >= 70 ? '우수' : '양호'}`),
    improvements: sorted.slice(-2).reverse().map((item) => `${item.label} ${item.score < 45 ? '불안정' : '보완 필요'}`),
    comment: `${sorted[0]?.label ?? '성향'} 중심, ${sorted.at(-1)?.label ?? '일관성'} 보완 여지`,
  }
}

export interface BuildPlayStyleAnalysisParams {
  playerMatches: MatchSummary[]
  populationMatchSets: MatchSummary[][]
  tierPopulationMatchSets?: MatchSummary[][]
  basisLabel?: string
  minSample?: number
}

export function buildPlayStyleAnalysis(params: BuildPlayStyleAnalysisParams): PlayerPlayStyleAnalysis {
  const minSample = params.minSample ?? MIN_SAMPLE
  const basisLabel = params.basisLabel ?? '데모 매치 기준'
  const insufficient = (sampleSize: number, comment: string): PlayerPlayStyleAnalysis => ({
    status: 'insufficient',
    sampleSize,
    axisScores: {},
    tierAverageAxes: {},
    roleFitScores: {},
    primaryRole: null,
    secondaryRole: null,
    unavailableMetrics: [],
    overallScore: null,
    strengths: [],
    improvements: [],
    comment,
    chartData: [],
    basisLabel,
  })

  if (params.playerMatches.length < minSample) {
    return insufficient(params.playerMatches.length, '표본 부족으로 플레이 성향을 계산할 수 없습니다.')
  }

  const playerMetrics = deriveMatchSetMetrics(params.playerMatches)
  if (!playerMetrics) return insufficient(params.playerMatches.length, '지표 계산에 실패했습니다.')

  const population = params.populationMatchSets
    .map((matches) => deriveMatchSetMetrics(matches))
    .filter((metrics): metrics is MatchSetDerivedMetrics => metrics != null)
  const tierPopulation = (params.tierPopulationMatchSets ?? [])
    .map((matches) => deriveMatchSetMetrics(matches))
    .filter((metrics): metrics is MatchSetDerivedMetrics => metrics != null)

  const roleDistribution = buildRoleDistribution(params.playerMatches)
  const { scores: axisScores, unavailable } = computeAxisScores(playerMetrics, population)
  const roleFitScores = computeRoleFitScores(axisScores)
  const { primary, secondary } = rankRoles(roleFitScores, roleDistribution)
  const tierAverageAxes = buildTierAverageAxes(population, tierPopulation)
  const insights = buildInsights(axisScores)
  // [계산 방식] 포지션 분포로 합산한 축 가중치 × 축 점수 → 종합 점수
  const overallScore = weightedOverallScore(axisScores, blendAxisWeights(roleDistribution))

  const chartData = ANALYSIS_AXES.flatMap((axis) => {
    const value = axisScores[axis]
    if (value == null) return []
    return [{ subject: ANALYSIS_AXIS_LABELS[axis], axis, value, tierAvg: tierAverageAxes[axis] ?? 50, fullMark: 100 }]
  })

  return {
    status: 'ok',
    sampleSize: params.playerMatches.length,
    axisScores,
    tierAverageAxes,
    roleFitScores,
    primaryRole: primary,
    secondaryRole: secondary,
    unavailableMetrics: unavailable,
    overallScore,
    strengths: insights.strengths,
    improvements: insights.improvements,
    comment: insights.comment,
    chartData,
    basisLabel,
  }
}

export function roleFitLabel(role: PlayStyleRole | null): string {
  if (!role) return '판단 보류'
  if (role === 'dealer') return '딜러'
  return PLAYER_ROLE_LABELS[role]
}
