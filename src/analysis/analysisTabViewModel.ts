import {
  buildTeamLuckViewModel,
  enrichSummaryCardFromProductionAxes,
} from '@/analysis/analysisSummaryEnrichment'
import type { TeamLuckViewModel } from '@/analysis/analysisSummaryEnrichment'
import type { AnalysisTabMeta } from '@/analysis/analysisTabMeta'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerAnalysisReport } from '@/analysis/types'
import {
  ANALYSIS_DISCLAIMER,
  ANALYSIS_UI_SECTIONS,
  getConfidenceLabel,
  isSecondaryMetric,
  shouldShowMetricInSection,
  SUMMARY_CARD_METRIC_IDS,
} from '@/analysis/analysisUiLabels'
import { buildAnalysisAxisDisplayCopy } from '@/analysis/analysisAxisCopy'
import {
  buildCharacterScopedPlayStyleAnalysis,
  buildCharacterScopedPlayerReport,
} from '@/analysis/characterScopedAnalysis'
import { buildRealPlayStyleAnalysisFromProductionAxes } from '@/analysis/realPlayStyleAnalysis'
import {
  computeAnalysisEligibility,
  formatAllCharacterInsufficientMessage,
  formatAllCharacterSampleBasisNote,
  isAllCharacterAnalysisSampleSufficient,
  isSpecificCharacterAnalysisSampleSufficient,
  type AnalysisEligibilityResult,
} from '@/analysis/analysisEligibility'
import { buildPlayerAnalysisViewModel } from '@/analysis/playerAnalysisViewModel'
import type { AnalysisMetricStatus, AnalysisMetricViewModel } from '@/analysis/metricTypes'
import type { PlayerPlayStyleAnalysis } from '@/analysis/playStyleTypes'
import type { MatchEquipmentPreview, MatchSummary } from '@/types/match'
import type { ProductionAnalysisAxesDTO, TeamPerformanceSummaryDTO } from '@/types/player'
import { localizeCharacter, resolveCharacterDisplayName } from '@/utils/gameLabels'

export type AnalysisMetricCardSize = 'small' | 'medium' | 'featured'

export interface AnalysisCharacterRow {
  /** 매치 필터용 영문 characterName */
  id: string
  name: string
  characterNum?: number
  games: number
  winRate: string
  avgPlacement: string
  featured: boolean
  /** 캐릭터별 상세 분석(다음 단계) 연결용 */
  equipmentPreview?: MatchEquipmentPreview
}

export interface AnalysisAxisRow {
  axis: string
  label: string
  score: number
  tierAvg: number
  /** @deprecated compact summary 사용 */
  keyword: string
  summary: string
  detail: string
  sampleNote?: string | null
}

export interface AnalysisMetricCardModel {
  id: string
  label: string
  value: string
  hint?: string
  size: AnalysisMetricCardSize
  unavailable?: boolean
  status: AnalysisMetricStatus
  isSecondary?: boolean
}

export interface AnalysisMetricSectionModel {
  id: string
  title: string
  description: string
  defaultExpanded: boolean
  futureOnly: boolean
  metrics: AnalysisMetricCardModel[]
}

export interface AnalysisTabViewModel {
  status: 'ok' | 'insufficient'
  selectedCharacterKey: string | null
  selectedCharacterLabel: string | null
  sourceLabel: string
  sampleLabel: string
  basisLabel: string
  seasonSourceLabel: string
  seasonSampleLabel: string
  seasonConfidenceLabel: string
  trendBasisLabel: string
  trendSampleCount: number
  scopeNote: string | null
  showScopeSplit: boolean
  /** scope split 시 카드 하단 trend basis 반복 억제 */
  showCardTrendBasis: boolean
  /** scope split 시 헤더와 중복되는 footer note 숨김 */
  showFooterBasisNote: boolean
  referenceScoreLabel: string | null
  headline: string
  insightLine: string
  estimatedTendency: string | null
  secondaryTendency: string | null
  rolePrimaryLabel: string | null
  roleSecondaryLabel: string | null
  roleConfidence: 'low' | 'medium' | 'high' | null
  roleReasonSummary: string | null
  playStyleBasisLabel: string
  summaryCards: AnalysisMetricCardModel[]
  characters: AnalysisCharacterRow[]
  axisRows: AnalysisAxisRow[]
  chartData: { subject: string; value: number; tierAvg: number; fullMark: number }[]
  metricSections: AnalysisMetricSectionModel[]
  teamPreviewMetrics: AnalysisMetricCardModel[]
  futureMetrics: AnalysisMetricViewModel[]
  strengths: string[]
  improvements: string[]
  analysisScore: number | null
  sampleSize: number
  dataConfidence: string
  confidenceLabel: string
  sampleBasisNote: string | null
  eligibilityMeta: AnalysisEligibilityResult['breakdown'] | null
  isPartial: boolean
  isComplete: boolean
  isBackfilling: boolean
  readyMetricCount: number
  disclaimer: string
  unavailableNote: string | null
  teamLuck: TeamLuckViewModel
  /** @deprecated flat grid — metricSections 사용 */
  metricCards: AnalysisMetricCardModel[]
}

function metricCardSize(
  metric: AnalysisMetricViewModel,
  variant: 'summary' | 'section',
): AnalysisMetricCardSize {
  if (variant === 'summary') return 'medium'
  if (metric.id === 'avgPlacement') return 'featured'
  if (metric.isPrimary && !isSecondaryMetric(metric.id)) return 'medium'
  return 'small'
}

function metricToCard(
  metric: AnalysisMetricViewModel,
  variant: 'summary' | 'section',
): AnalysisMetricCardModel {
  return {
    id: metric.id,
    label: metric.label,
    value: metric.formattedValue,
    hint: metric.description,
    size: metricCardSize(metric, variant),
    unavailable: metric.status !== 'ready',
    status: metric.status,
    isSecondary: isSecondaryMetric(metric.id),
  }
}

function findMetric(metrics: AnalysisMetricViewModel[], id: string): AnalysisMetricViewModel | undefined {
  return metrics.find((m) => m.id === id)
}

function buildAllMetrics(playerVm: ReturnType<typeof buildPlayerAnalysisViewModel>): AnalysisMetricViewModel[] {
  return [
    ...playerVm.summaryMetrics,
    ...playerVm.sections.flatMap((s) => s.metrics),
    ...playerVm.futureMetrics,
    ...playerVm.unavailableMetrics,
  ]
}

function countReadyMetrics(cards: AnalysisMetricCardModel[]): number {
  const seen = new Set<string>()
  let count = 0
  for (const card of cards) {
    if (seen.has(card.id) || card.status !== 'ready') continue
    seen.add(card.id)
    count += 1
  }
  return count
}

function uniqueMetrics(metrics: AnalysisMetricViewModel[]): AnalysisMetricViewModel[] {
  const seen = new Set<string>()
  return metrics.filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })
}

function buildMetricSections(
  allMetrics: AnalysisMetricViewModel[],
): AnalysisMetricSectionModel[] {
  return ANALYSIS_UI_SECTIONS.map((sectionConfig) => {
    const sectionMetrics = uniqueMetrics(
      allMetrics.filter((m) => sectionConfig.categories.includes(m.category)),
    ).filter((m) => shouldShowMetricInSection(m.status, sectionConfig.futureOnly ?? false))

    return {
      id: sectionConfig.id,
      title: sectionConfig.title,
      description: sectionConfig.description,
      defaultExpanded: sectionConfig.defaultExpanded,
      futureOnly: sectionConfig.futureOnly ?? false,
      metrics: sectionMetrics.map((m) => metricToCard(m, 'section')),
    }
  }).filter((section) => section.metrics.length > 0 || section.futureOnly)
}

export interface BuildAnalysisTabViewModelParams {
  playStyleAnalysis: PlayerPlayStyleAnalysis | null
  analysisReport: PlayerAnalysisReport | null
  characterReports: CharacterAnalysisReport[]
  analysisMatches: MatchSummary[]
  basisLabel: string
  nickname?: string
  selectedCharacterKey?: string | null
  populationMatchSets?: MatchSummary[][]
  tierPopulationMatchSets?: MatchSummary[][]
  populationMatches?: MatchSummary[]
  analysisTabMeta?: AnalysisTabMeta | null
  productionAxes?: ProductionAnalysisAxesDTO | null
  teamPerformanceSummary?: TeamPerformanceSummaryDTO | null
  analysisEligibility?: AnalysisEligibilityResult | null
  analysisSeasonMatches?: MatchSummary[]
  acceptLoadedSeasonFallback?: boolean
  seasonNumber?: number
  seasonFallback?: number
}

function resolveAnalysisTabDisplay(showScopeSplit: boolean): Pick<
  AnalysisTabViewModel,
  'showCardTrendBasis' | 'showFooterBasisNote'
> {
  return {
    showCardTrendBasis: !showScopeSplit,
    showFooterBasisNote: !showScopeSplit,
  }
}

export function resolveCharacterStatsDisplayLabel(
  characterStatsBasisLabel: string | undefined,
  showScopeSplit: boolean,
): string | null {
  if (!characterStatsBasisLabel?.trim()) return null
  // real scope split — 헤더 시즌 데이터로 충분
  if (showScopeSplit) return null
  return characterStatsBasisLabel.trim()
}

function applyAnalysisTabMeta(
  basisLabel: string,
  playerVm: ReturnType<typeof buildPlayerAnalysisViewModel>,
  analysisTabMeta?: AnalysisTabMeta | null,
): Pick<
  AnalysisTabViewModel,
  | 'sourceLabel'
  | 'sampleLabel'
  | 'basisLabel'
  | 'sampleSize'
  | 'dataConfidence'
  | 'confidenceLabel'
  | 'isPartial'
  | 'isComplete'
  | 'isBackfilling'
  | 'seasonSourceLabel'
  | 'seasonSampleLabel'
  | 'seasonConfidenceLabel'
  | 'trendBasisLabel'
  | 'trendSampleCount'
  | 'scopeNote'
  | 'showScopeSplit'
  | 'playStyleBasisLabel'
> {
  if (!analysisTabMeta) {
    const trendBasisLabel = playerVm.playStyleBasisLabel
    return {
      sourceLabel: basisLabel,
      sampleLabel: playerVm.sampleSize > 0 ? `최근 ${playerVm.sampleSize}경기 기준` : '표본 부족',
      basisLabel,
      sampleSize: playerVm.sampleSize,
      dataConfidence: playerVm.dataConfidence,
      confidenceLabel: getConfidenceLabel(playerVm.dataConfidence),
      isPartial: false,
      isComplete: false,
      isBackfilling: false,
      seasonSourceLabel: basisLabel,
      seasonSampleLabel: playerVm.sampleSize > 0 ? `최근 ${playerVm.sampleSize}경기 기준` : '표본 부족',
      seasonConfidenceLabel: getConfidenceLabel(playerVm.dataConfidence),
      trendBasisLabel,
      trendSampleCount: playerVm.sampleSize,
      scopeNote: null,
      showScopeSplit: false,
      playStyleBasisLabel: trendBasisLabel,
    }
  }

  return {
    sourceLabel: analysisTabMeta.seasonSourceLabel,
    sampleLabel: analysisTabMeta.seasonSampleLabel,
    basisLabel: analysisTabMeta.seasonSourceLabel,
    sampleSize: analysisTabMeta.seasonSampleCount,
    dataConfidence: analysisTabMeta.confidenceLevel,
    confidenceLabel: analysisTabMeta.seasonConfidenceLabel,
    isPartial: analysisTabMeta.isPartial,
    isComplete: analysisTabMeta.isComplete,
    isBackfilling: analysisTabMeta.isBackfilling,
    seasonSourceLabel: analysisTabMeta.seasonSourceLabel,
    seasonSampleLabel: analysisTabMeta.seasonSampleLabel,
    seasonConfidenceLabel: analysisTabMeta.seasonConfidenceLabel,
    trendBasisLabel: analysisTabMeta.trendBasisLabel,
    trendSampleCount: analysisTabMeta.trendSampleCount,
    scopeNote: analysisTabMeta.scopeNote,
    showScopeSplit: true,
    playStyleBasisLabel: analysisTabMeta.trendBasisLabel,
  }
}

function resolveCharacterKey(reportName: string, matches: MatchSummary[]): string {
  const trimmed = reportName.trim()
  const byEnglish = matches.find((match) => match.characterName === trimmed)
  if (byEnglish?.characterName) return byEnglish.characterName

  const byLocalized = matches.find(
    (match) =>
      resolveCharacterDisplayName(match.characterNum, match.characterName) === trimmed,
  )
  return byLocalized?.characterName ?? trimmed
}

export function buildAnalysisTabViewModel(
  params: BuildAnalysisTabViewModelParams,
): AnalysisTabViewModel {
  const {
    playStyleAnalysis,
    analysisReport,
    characterReports,
    analysisMatches,
    basisLabel,
    nickname,
    selectedCharacterKey = null,
    populationMatchSets,
    tierPopulationMatchSets,
    populationMatches,
    analysisTabMeta,
    productionAxes = null,
    teamPerformanceSummary = null,
    analysisEligibility = null,
    analysisSeasonMatches,
    acceptLoadedSeasonFallback = false,
    seasonNumber = 11,
    seasonFallback = 11,
  } = params

  const scopedCharacterKey = selectedCharacterKey?.trim() || null
  const scopedCharacterLabel = scopedCharacterKey
    ? localizeCharacter(scopedCharacterKey)
    : null
  const scopedBasisLabel = scopedCharacterLabel
    ? `${basisLabel} · ${scopedCharacterLabel}`
    : basisLabel

  let scopedPlayStyle = playStyleAnalysis
  let scopedReport = analysisReport
  let scopedMatches = analysisMatches
  const selectedCharacterReport = scopedCharacterKey
    ? characterReports.find((report) => {
        const resolved = resolveCharacterDisplayName(report.characterNum, report.characterName)
        return (
          report.characterName === scopedCharacterKey ||
          resolved === scopedCharacterKey ||
          resolved === scopedCharacterLabel
        )
      })
    : undefined

  if (scopedCharacterKey && selectedCharacterReport?.analysisAxes) {
    scopedMatches = analysisMatches.filter((match) => {
      const resolved = resolveCharacterDisplayName(match.characterNum, match.characterName)
      return (
        match.characterName === scopedCharacterKey ||
        resolved === scopedCharacterKey ||
        resolved === scopedCharacterLabel
      )
    })
    const score =
      selectedCharacterReport.gradeAggregation?.finalScore ??
      selectedCharacterReport.gradeScore ??
      selectedCharacterReport.overallScore
    scopedPlayStyle = buildRealPlayStyleAnalysisFromProductionAxes({
      axes: selectedCharacterReport.analysisAxes,
      overallScore: score,
      primaryGradeRole: selectedCharacterReport.gradeRole ?? null,
      basisLabel: `${scopedBasisLabel} · 캐릭터 6축`,
    })
    if (scopedReport) {
      scopedReport = {
        ...scopedReport,
        overallGrade: selectedCharacterReport.overallGrade,
        overallPerformanceScore: score,
        overallScoreSource: 'character-grade-weighted-average',
        sampleSize: selectedCharacterReport.matchCount,
        weightedMatchCount: selectedCharacterReport.matchCount,
        gradedCharacterCount: 1,
        summary: `${selectedCharacterReport.characterName} 최근 랭크 기록을 역할 기준으로 분석했어요.`,
      }
    }
  }

  if (
    scopedCharacterKey &&
    !selectedCharacterReport?.analysisAxes &&
    populationMatchSets &&
    populationMatchSets.length > 0 &&
    nickname
  ) {
    scopedMatches = analysisMatches.filter((match) => {
      const resolved = resolveCharacterDisplayName(match.characterNum, match.characterName)
      return (
        match.characterName === scopedCharacterKey ||
        resolved === scopedCharacterKey ||
        resolved === scopedCharacterLabel
      )
    })
    scopedPlayStyle = buildCharacterScopedPlayStyleAnalysis({
      characterKey: scopedCharacterKey,
      playerMatches: analysisMatches,
      populationMatchSets,
      tierPopulationMatchSets,
      basisLabel: scopedBasisLabel,
    })
    if (populationMatches) {
      scopedReport = buildCharacterScopedPlayerReport({
        characterKey: scopedCharacterKey,
        nickname,
        playerMatches: analysisMatches,
        populationMatches,
      })
    }
  }

  const eligibilitySourceMatches = analysisSeasonMatches ?? analysisMatches
  const scopedEligibility =
    !scopedCharacterKey && analysisEligibility
      ? analysisEligibility
      : computeAnalysisEligibility({
          matches: eligibilitySourceMatches,
          seasonNumber,
          seasonFallback,
          characterKey: scopedCharacterKey,
          scope: analysisEligibility?.scope ?? 'all',
          acceptLoadedSeasonFallback:
            acceptLoadedSeasonFallback === true ||
            (eligibilitySourceMatches.length > 0 &&
              !eligibilitySourceMatches.some(
                (match) => (match.seasonNumber ?? seasonFallback) === seasonNumber,
              )),
        })
  const isAllCharacterScope = scopedCharacterKey == null
  const enforceAllCharacterSampleGate = analysisEligibility != null && isAllCharacterScope

  scopedMatches = scopedEligibility.matches

  const playerVm = buildPlayerAnalysisViewModel({
    playStyleAnalysis: scopedPlayStyle,
    analysisReport: scopedReport,
    analysisMatches: scopedMatches,
    basisLabel: scopedBasisLabel,
    eligibleSampleSize: enforceAllCharacterSampleGate
      ? scopedEligibility.analysisEligibleMatches
      : undefined,
    confidencePolicy: enforceAllCharacterSampleGate ? 'all-character' : 'default',
  })

  const sampleSufficient = enforceAllCharacterSampleGate
    ? isAllCharacterAnalysisSampleSufficient(scopedEligibility.analysisEligibleMatches)
    : scopedCharacterKey
      ? isSpecificCharacterAnalysisSampleSufficient(scopedEligibility.analysisEligibleMatches)
      : playerVm.dataConfidence !== 'insufficient'

  const characters = [...characterReports]
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 5)
    .map((row, index) => {
      const characterKey = resolveCharacterKey(row.characterName, analysisMatches)
      const latestMatch = analysisMatches.find(
        (m) => m.characterName === characterKey && m.equipmentPreview,
      )
      return {
        id: characterKey,
        name: resolveCharacterDisplayName(row.characterNum, row.characterName),
        characterNum: row.characterNum,
        games: row.matchCount,
        winRate: `${row.winRate.toFixed(1)}%`,
        avgPlacement: row.avgPlacement != null ? row.avgPlacement.toFixed(2) : '-',
        featured: index === 0,
        equipmentPreview: latestMatch?.equipmentPreview,
      }
    })

  const displayMeta = applyAnalysisTabMeta(scopedBasisLabel, playerVm, analysisTabMeta)
  const displayFlags = resolveAnalysisTabDisplay(displayMeta.showScopeSplit)
  const emptyBase = {
    selectedCharacterKey: scopedCharacterKey,
    selectedCharacterLabel: scopedCharacterLabel,
    sourceLabel: displayMeta.sourceLabel,
    sampleLabel: displayMeta.sampleLabel,
    basisLabel: displayMeta.basisLabel,
    seasonSourceLabel: displayMeta.seasonSourceLabel,
    seasonSampleLabel: displayMeta.seasonSampleLabel,
    seasonConfidenceLabel: displayMeta.seasonConfidenceLabel,
    trendBasisLabel: displayMeta.trendBasisLabel,
    trendSampleCount: displayMeta.trendSampleCount,
    scopeNote: displayMeta.scopeNote,
    showScopeSplit: displayMeta.showScopeSplit,
    showCardTrendBasis: displayFlags.showCardTrendBasis,
    showFooterBasisNote: displayFlags.showFooterBasisNote,
    headline: scopedCharacterLabel
      ? `${scopedCharacterLabel} 표본 부족`
      : '표본 부족',
    referenceScoreLabel: null as string | null,
    insightLine: scopedCharacterLabel
      ? `${scopedCharacterLabel} 최근 경기가 부족해 분석을 표시할 수 없습니다.`
      : isAllCharacterScope
        ? formatAllCharacterInsufficientMessage(
            scopedEligibility.breakdown,
            scopedEligibility.scope,
          )
        : '최근 랭크 매치가 부족해 분석을 표시할 수 없습니다.',
    estimatedTendency: null as string | null,
    secondaryTendency: null as string | null,
    rolePrimaryLabel: null as string | null,
    roleSecondaryLabel: null as string | null,
    roleConfidence: null as 'low' | 'medium' | 'high' | null,
    roleReasonSummary: null as string | null,
    playStyleBasisLabel: displayMeta.playStyleBasisLabel,
    summaryCards: [] as AnalysisMetricCardModel[],
    characters,
    axisRows: [] as AnalysisAxisRow[],
    chartData: [] as AnalysisTabViewModel['chartData'],
    metricSections: [] as AnalysisMetricSectionModel[],
    teamPreviewMetrics: [] as AnalysisMetricCardModel[],
    futureMetrics: playerVm.futureMetrics,
    strengths: [] as string[],
    improvements: [] as string[],
    analysisScore: null as number | null,
    sampleSize: scopedEligibility.analysisEligibleMatches,
    dataConfidence: displayMeta.dataConfidence,
    confidenceLabel: displayMeta.confidenceLabel,
    sampleBasisNote: null,
    eligibilityMeta: scopedEligibility.breakdown,
    isPartial: displayMeta.isPartial,
    isComplete: displayMeta.isComplete,
    isBackfilling: displayMeta.isBackfilling,
    readyMetricCount: 0,
    disclaimer: ANALYSIS_DISCLAIMER,
    unavailableNote: null as string | null,
    metricCards: [] as AnalysisMetricCardModel[],
    teamLuck: buildTeamLuckViewModel({ matches: scopedMatches, summary: teamPerformanceSummary }),
  }

  if (!sampleSufficient) {
    return { status: 'insufficient', ...emptyBase }
  }

  const allMetrics = buildAllMetrics(playerVm)

  const activeProductionAxes =
    selectedCharacterReport?.analysisAxes ?? productionAxes ?? null

  const summaryCards = SUMMARY_CARD_METRIC_IDS.flatMap((id) => {
    const metric = findMetric(allMetrics, id)
    if (!metric) return []
    const card = metricToCard(metric, 'summary')
    if (card.status === 'unavailable' || card.status === 'future') return []
    return [enrichSummaryCardFromProductionAxes(card, activeProductionAxes)]
  })

  const totalAxisSampleCount =
    scopedEligibility.analysisEligibleMatches ||
    activeProductionAxes?.sampleCount ||
    scopedPlayStyle?.sampleSize ||
    displayMeta.trendSampleCount

  const axisRows: AnalysisAxisRow[] = playerVm.radarAxes.map((row) => {
    const axisDetail = scopedPlayStyle?.axisDetails?.find((detail) => detail.axis === row.axis)
    const copy = axisDetail
      ? buildAnalysisAxisDisplayCopy(axisDetail, totalAxisSampleCount)
      : { summary: row.keyword, detail: '', sampleNote: null }
    return {
      axis: row.axis,
      label: row.label,
      score: row.score,
      tierAvg: playerVm.chartData.find((p) => p.subject === row.label)?.referenceAvg ?? 65,
      keyword: copy.summary,
      summary: copy.summary,
      detail: copy.detail,
      sampleNote: copy.sampleNote,
    }
  })

  const chartData = playerVm.chartData.map((point) => ({
    subject: point.subject,
    value: point.value,
    tierAvg: point.referenceAvg,
    fullMark: point.fullMark,
  }))

  const metricSections = buildMetricSections(allMetrics).filter((section) => !section.futureOnly)
  const teamLuck = buildTeamLuckViewModel({
    matches: scopedMatches,
    summary: teamPerformanceSummary,
  })

  const flatCards = metricSections
    .filter((s) => !s.futureOnly)
    .flatMap((s) => s.metrics)

  const readyMetricCount = countReadyMetrics([...summaryCards, ...flatCards])
  const displayHeadline =
    nickname && scopedEligibility.analysisEligibleMatches > 0
      ? `${nickname} · ${scopedEligibility.analysisEligibleMatches}경기 분석`
      : playerVm.headline

  return {
    status: 'ok',
    selectedCharacterKey: scopedCharacterKey,
    selectedCharacterLabel: scopedCharacterLabel,
    sourceLabel: displayMeta.sourceLabel,
    sampleLabel: displayMeta.sampleLabel,
    basisLabel: displayMeta.basisLabel,
    seasonSourceLabel: displayMeta.seasonSourceLabel,
    seasonSampleLabel: displayMeta.seasonSampleLabel,
    seasonConfidenceLabel: displayMeta.seasonConfidenceLabel,
    trendBasisLabel: displayMeta.trendBasisLabel,
    trendSampleCount: displayMeta.trendSampleCount,
    scopeNote: displayMeta.scopeNote,
    showScopeSplit: displayMeta.showScopeSplit,
    showCardTrendBasis: displayFlags.showCardTrendBasis,
    showFooterBasisNote: displayFlags.showFooterBasisNote,
    headline: displayHeadline,
    referenceScoreLabel: '기준 점수 65',
    insightLine: playerVm.insightLine,
    estimatedTendency: playerVm.estimatedTendency,
    secondaryTendency: playerVm.secondaryTendency,
    rolePrimaryLabel: playerVm.rolePrimaryLabel,
    roleSecondaryLabel: playerVm.roleSecondaryLabel,
    roleConfidence: playerVm.roleConfidence,
    roleReasonSummary: playerVm.roleReasonSummary,
    playStyleBasisLabel: displayMeta.playStyleBasisLabel,
    summaryCards,
    characters,
    axisRows,
    chartData,
    metricSections,
    teamPreviewMetrics: [],
    futureMetrics: playerVm.futureMetrics.filter((m) => m.category !== 'team'),
    strengths: playerVm.strengths,
    improvements: playerVm.improvements,
    analysisScore: playerVm.analysisScore,
    sampleSize: scopedEligibility.analysisEligibleMatches,
    dataConfidence: displayMeta.dataConfidence,
    confidenceLabel: displayMeta.confidenceLabel,
    sampleBasisNote: isAllCharacterScope
      ? formatAllCharacterSampleBasisNote(
          scopedEligibility.breakdown,
          displayMeta.confidenceLabel,
          scopedEligibility.scope,
        )
      : null,
    eligibilityMeta: scopedEligibility.breakdown,
    isPartial: displayMeta.isPartial,
    isComplete: displayMeta.isComplete,
    isBackfilling: displayMeta.isBackfilling,
    readyMetricCount,
    disclaimer: ANALYSIS_DISCLAIMER,
    unavailableNote: playerVm.dataNote,
    metricCards: flatCards,
    teamLuck,
  }
}
