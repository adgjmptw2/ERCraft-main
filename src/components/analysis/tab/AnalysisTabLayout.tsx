import { useMemo, useState } from 'react'

import { buildAnalysisTabViewModel, resolveCharacterStatsDisplayLabel } from '@/analysis/analysisTabViewModel'
import {
  buildAnalysisListRows,
  buildAnalysisSummaryLine,
  mapAnalysisMetricsToCards,
  selectAnalysisRow,
  type AnalysisListSelection,
} from '@/analysis/playerAnalysisAdapter'
import type { AnalysisEligibilityResult } from '@/analysis/analysisEligibility'
import type { AnalysisTabMeta } from '@/analysis/analysisTabMeta'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerAnalysisReport } from '@/analysis/types'
import type { PlayerPlayStyleAnalysis } from '@/analysis/playStyleTypes'
import { AnalysisBasisNote } from '@/components/analysis/AnalysisBasisNote'
import { AnalysisHeader } from '@/components/analysis/tab/AnalysisHeader'
import { AnalysisInsightChip } from '@/components/analysis/tab/AnalysisInsightChip'
import { AnalysisMetricGrid } from '@/components/analysis/tab/AnalysisMetricGrid'
import { AnalysisMetricSection } from '@/components/analysis/tab/AnalysisMetricSection'
import { AnalysisRadarPanel } from '@/components/analysis/tab/AnalysisRadarPanel'
import { AnalysisRoleSummaryCard } from '@/components/analysis/tab/AnalysisRoleSummaryCard'
import { AnalysisSummaryPanel } from '@/components/analysis/tab/AnalysisSummaryPanel'
import { AnalysisSummaryCards } from '@/components/analysis/tab/AnalysisSummaryCards'
import { AnalysisTeamLuckSection } from '@/components/analysis/tab/AnalysisTeamLuckSection'
import type { MatchSummary } from '@/types/match'
import type { PlayerAnalysisResponseDTO } from '@/types/playerAnalysis'
import type { ProductionAnalysisAxesDTO, TeamPerformanceSummaryDTO } from '@/types/player'
import type { AnalysisScope } from '@/utils/analysisAggregation'
import { cn } from '@/lib/utils'

export interface AnalysisTabLayoutProps {
  nickname: string
  playStyleAnalysis: PlayerPlayStyleAnalysis | null
  analysisReport: PlayerAnalysisReport | null
  characterReports: CharacterAnalysisReport[]
  profileOwnerKey?: string
  analysisMatches: MatchSummary[]
  populationMatchSets: MatchSummary[][]
  tierPopulationMatchSets: MatchSummary[][]
  populationMatches: MatchSummary[]
  basisLabel: string
  characterStatsBasisLabel?: string
  analysisTabMeta?: AnalysisTabMeta | null
  productionAxes?: ProductionAnalysisAxesDTO | null
  teamPerformanceSummary?: TeamPerformanceSummaryDTO | null
  analysisEligibility?: AnalysisEligibilityResult | null
  analysisSeasonMatches?: MatchSummary[]
  acceptLoadedSeasonFallback?: boolean
  seasonNumber?: number
  analysisScope: AnalysisScope
  showScopeToggle: boolean
  onScopeChange: (scope: AnalysisScope) => void
  className?: string
  playerAnalysis?: PlayerAnalysisResponseDTO | null
}

export function AnalysisTabLayout({
  nickname,
  playStyleAnalysis,
  analysisReport,
  characterReports,
  analysisMatches,
  populationMatchSets,
  tierPopulationMatchSets,
  populationMatches,
  basisLabel,
  characterStatsBasisLabel,
  analysisTabMeta,
  productionAxes = null,
  teamPerformanceSummary = null,
  analysisEligibility = null,
  analysisSeasonMatches,
  acceptLoadedSeasonFallback = false,
  seasonNumber,
  profileOwnerKey,
  analysisScope,
  showScopeToggle,
  onScopeChange,
  className,
  playerAnalysis = null,
}: AnalysisTabLayoutProps) {
  const [selectedCharacterKey, setSelectedCharacterKey] = useState<string | null>(null)
  const [selectedScopeKey, setSelectedScopeKey] = useState<AnalysisListSelection>('overall')
  const [selectionResetDeps, setSelectionResetDeps] = useState({
    profileOwnerKey: profileOwnerKey ?? nickname,
    basisLabel,
    analysisMatches,
  })

  if (
    selectionResetDeps.profileOwnerKey !== (profileOwnerKey ?? nickname) ||
    selectionResetDeps.basisLabel !== basisLabel ||
    selectionResetDeps.analysisMatches !== analysisMatches
  ) {
    setSelectionResetDeps({
      profileOwnerKey: profileOwnerKey ?? nickname,
      basisLabel,
      analysisMatches,
    })
    if (selectedCharacterKey !== null) {
      setSelectedCharacterKey(null)
    }
    if (selectedScopeKey !== 'overall') {
      setSelectedScopeKey('overall')
    }
  }

  const apiScopeRows = useMemo(
    () => (playerAnalysis ? buildAnalysisListRows(playerAnalysis) : []),
    [playerAnalysis],
  )
  const apiSelectedRow = useMemo(
    () => (playerAnalysis ? selectAnalysisRow(playerAnalysis, selectedScopeKey) : null),
    [playerAnalysis, selectedScopeKey],
  )
  const apiMetricCards = useMemo(
    () => (apiSelectedRow ? mapAnalysisMetricsToCards(apiSelectedRow) : []),
    [apiSelectedRow],
  )
  const apiChartData = useMemo(() => {
    if (!apiSelectedRow) return []
    const hasCohortMedian = apiSelectedRow.radarAxes.some(
      (axis) => axis.cohortMedian != null && axis.cohortMedian > 0,
    )
    return apiSelectedRow.radarAxes.map((axis) => ({
      subject: axis.label,
      value: axis.playerScore ?? 0,
      tierAvg: hasCohortMedian ? (axis.cohortMedian ?? 50) : (axis.playerScore ?? 50),
      fullMark: 100,
    }))
  }, [apiSelectedRow])
  const apiAxisRows = useMemo(
    () =>
      apiSelectedRow?.radarAxes.map((axis) => ({
        axis: axis.axis,
        label: axis.label,
        score: axis.playerScore ?? 0,
        tierAvg: axis.cohortMedian ?? axis.playerScore ?? 50,
        keyword: axis.label,
        summary: axis.label,
        detail: axis.label,
      })) ?? [],
    [apiSelectedRow],
  )

  if (playerAnalysis && apiSelectedRow) {
    return (
      <div className={cn('flex min-w-0 flex-col gap-5 lg:gap-6', className)}>
        <AnalysisHeader
          sourceLabel={`현재 시즌 랭크 ${playerAnalysis.totals.includedRankMatches ?? playerAnalysis.totals.rankMatches}경기`}
          sampleLabel={`분석 제외 일반 ${playerAnalysis.totals.excludedNormal ?? playerAnalysis.totals.normalMatches}경기`}
          basisLabel={basisLabel}
          seasonSourceLabel="현재 시즌 랭크"
          seasonSampleLabel={`랭크 ${playerAnalysis.totals.includedRankMatches ?? playerAnalysis.totals.rankMatches}경기`}
          seasonConfidenceLabel={apiSelectedRow.confidence}
          trendBasisLabel={apiSelectedRow.comparison.displayLabel}
          sampleBasisNote={apiSelectedRow.comparison.displayLabel}
          scopeNote={null}
          showScopeSplit={false}
          headline={apiSelectedRow.label}
          referenceScoreLabel={apiSelectedRow.gradeDisplay ?? apiSelectedRow.grade}
          insightLine={buildAnalysisSummaryLine(apiSelectedRow)}
          estimatedTendency={apiSelectedRow.primaryRole}
          secondaryTendency={null}
          confidenceLabel={apiSelectedRow.confidence}
          readyMetricCount={apiMetricCards.length}
          disclaimer="비교 cohort는 DB shadow benchmark 기준입니다."
          scope={analysisScope}
          showScopeToggle={false}
          onScopeChange={onScopeChange}
        />

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:items-start">
          <AnalysisSummaryPanel
            characters={[]}
            selectedCharacterKey={null}
            onCharacterSelect={() => {}}
            scopeRows={apiScopeRows}
            selectedScopeKey={selectedScopeKey}
            onScopeSelect={(key) => setSelectedScopeKey((key as AnalysisListSelection) ?? 'overall')}
          />

          <div className="flex min-w-0 flex-col gap-4">
            <AnalysisRoleSummaryCard
              primaryRole={apiSelectedRow.primaryRole}
              secondaryRole={null}
              confidence={
                apiSelectedRow.confidence === 'official'
                  ? 'high'
                  : apiSelectedRow.confidence === 'provisional'
                    ? 'medium'
                    : 'low'
              }
              reason={apiSelectedRow.comparison.displayLabel}
              basisLabel={`표본 ${apiSelectedRow.comparison.samplePlayers}명`}
              showBasisLabel
            />
            <AnalysisSummaryCards cards={apiMetricCards} compact />
            <AnalysisRadarPanel
              nickname={nickname}
              headline={apiSelectedRow.label}
              insightLine={apiSelectedRow.comparison.displayLabel}
              analysisScore={apiSelectedRow.overallScore}
              chartData={apiChartData}
              axisRows={apiAxisRows}
              basisLabel={`${apiSelectedRow.games}경기 · ${apiSelectedRow.comparison.displayLabel}`}
              showTrendBasis={false}
              characterLabel={apiSelectedRow.type === 'character' ? apiSelectedRow.label : null}
            />
          </div>
        </div>

        <AnalysisMetricGrid cards={apiMetricCards} />
      </div>
    )
  }

  const viewModel = useMemo(
    () =>
      buildAnalysisTabViewModel({
        playStyleAnalysis,
        analysisReport,
        characterReports,
        analysisMatches,
        basisLabel,
        nickname,
        selectedCharacterKey,
        populationMatchSets,
        tierPopulationMatchSets,
        populationMatches,
        analysisTabMeta,
        productionAxes,
        teamPerformanceSummary,
        analysisEligibility,
        analysisSeasonMatches,
        acceptLoadedSeasonFallback,
        seasonNumber,
        seasonFallback: seasonNumber,
      }),
    [
      playStyleAnalysis,
      analysisReport,
      characterReports,
      analysisMatches,
      basisLabel,
      nickname,
      selectedCharacterKey,
      populationMatchSets,
      tierPopulationMatchSets,
      populationMatches,
      analysisTabMeta,
      productionAxes,
      teamPerformanceSummary,
      analysisEligibility,
      analysisSeasonMatches,
      acceptLoadedSeasonFallback,
      seasonNumber,
    ],
  )

  const headerProps = {
    sourceLabel: viewModel.sourceLabel,
    sampleLabel: viewModel.sampleLabel,
    basisLabel: viewModel.basisLabel,
    seasonSourceLabel: viewModel.seasonSourceLabel,
    seasonSampleLabel: viewModel.seasonSampleLabel,
    seasonConfidenceLabel: viewModel.seasonConfidenceLabel,
    trendBasisLabel: viewModel.trendBasisLabel,
    sampleBasisNote: viewModel.sampleBasisNote,
    scopeNote: viewModel.scopeNote,
    showScopeSplit: viewModel.showScopeSplit,
    headline: viewModel.headline,
    referenceScoreLabel: viewModel.referenceScoreLabel,
    insightLine: viewModel.insightLine,
    estimatedTendency: viewModel.estimatedTendency,
    secondaryTendency: viewModel.secondaryTendency,
    confidenceLabel: viewModel.confidenceLabel,
    readyMetricCount: viewModel.readyMetricCount,
    disclaimer: viewModel.disclaimer,
    scope: analysisScope,
    showScopeToggle,
    onScopeChange,
  }

  const characterStatsLabel = resolveCharacterStatsDisplayLabel(
    characterStatsBasisLabel,
    viewModel.showScopeSplit,
  )

  if (viewModel.status === 'insufficient') {
    return (
      <div className={cn('flex min-w-0 flex-col gap-5', className)}>
        <AnalysisHeader {...headerProps} />

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:items-start">
          <AnalysisRadarPanel
            nickname={nickname}
            headline={viewModel.headline}
            insightLine={
              viewModel.selectedCharacterLabel
                ? `${viewModel.selectedCharacterLabel} 표본이 부족해 분석을 표시할 수 없습니다.`
                : viewModel.insightLine
            }
            analysisScore={viewModel.analysisScore}
            chartData={viewModel.chartData}
            axisRows={viewModel.axisRows}
            basisLabel={viewModel.playStyleBasisLabel}
            showTrendBasis={viewModel.showCardTrendBasis}
            characterLabel={viewModel.selectedCharacterLabel}
          />

          <div className="flex min-w-0 flex-col gap-4">
            <AnalysisRoleSummaryCard
              primaryRole={viewModel.rolePrimaryLabel}
              secondaryRole={viewModel.roleSecondaryLabel}
              confidence={viewModel.roleConfidence}
              reason={viewModel.roleReasonSummary}
              basisLabel={viewModel.playStyleBasisLabel}
              showBasisLabel={false}
            />
            <AnalysisSummaryPanel
              characters={viewModel.characters}
              selectedCharacterKey={selectedCharacterKey}
              onCharacterSelect={setSelectedCharacterKey}
              characterStatsBasisLabel={characterStatsLabel ?? undefined}
            />
          </div>
        </div>

        <AnalysisTeamLuckSection teamLuck={viewModel.teamLuck} />
        {viewModel.showFooterBasisNote ? <AnalysisBasisNote label={basisLabel} /> : null}
      </div>
    )
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-5 lg:gap-6', className)}>
      <AnalysisHeader {...headerProps} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:items-start">
        <AnalysisRadarPanel
          nickname={nickname}
          headline={viewModel.headline}
          insightLine={viewModel.insightLine}
          analysisScore={viewModel.analysisScore}
          chartData={viewModel.chartData}
          axisRows={viewModel.axisRows}
          basisLabel={viewModel.playStyleBasisLabel}
          showTrendBasis={false}
          characterLabel={viewModel.selectedCharacterLabel}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <AnalysisRoleSummaryCard
            primaryRole={viewModel.rolePrimaryLabel}
            secondaryRole={viewModel.roleSecondaryLabel}
            confidence={viewModel.roleConfidence}
            reason={viewModel.roleReasonSummary}
            basisLabel={viewModel.playStyleBasisLabel}
            showBasisLabel={false}
          />
          <AnalysisSummaryCards cards={viewModel.summaryCards} compact />
          <AnalysisSummaryPanel
            characters={viewModel.characters}
            selectedCharacterKey={selectedCharacterKey}
            onCharacterSelect={setSelectedCharacterKey}
            characterStatsBasisLabel={characterStatsLabel ?? undefined}
          />
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="analysis-sections-heading">
        <div className="space-y-0.5">
          <h2 id="analysis-sections-heading" className="text-foreground text-sm font-semibold">
            {viewModel.selectedCharacterLabel
              ? `${viewModel.selectedCharacterLabel} 카테고리별 지표`
              : '카테고리별 지표'}
          </h2>
          <p className="text-muted-foreground text-xs">
            {viewModel.selectedCharacterLabel
              ? '선택한 캐릭터의 최근 경기만 집계한 지표입니다'
              : '최근 경기 기준으로 계산된 지표입니다'}
          </p>
        </div>
        <div className="space-y-3">
          {viewModel.metricSections.map((section) => (
            <AnalysisMetricSection key={section.id} section={section} />
          ))}
        </div>
      </section>

      <AnalysisTeamLuckSection teamLuck={viewModel.teamLuck} />

      {(viewModel.strengths.length > 0 || viewModel.improvements.length > 0) && (
        <div className="border-border/60 bg-card/30 grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">강점</p>
            <div className="flex flex-wrap gap-1.5">
              {viewModel.strengths.map((item) => (
                <AnalysisInsightChip key={item} label={item} variant="strength" />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              보완 포인트
            </p>
            <div className="flex flex-wrap gap-1.5">
              {viewModel.improvements.map((item) => (
                <AnalysisInsightChip key={item} label={item} variant="improvement" />
              ))}
            </div>
          </div>
        </div>
      )}

      {viewModel.unavailableNote ? (
        <p className="text-muted-foreground text-[11px] leading-relaxed">{viewModel.unavailableNote}</p>
      ) : null}

      {viewModel.showFooterBasisNote ? (
        <AnalysisBasisNote label={viewModel.basisLabel} className="border-border/60 border-t pt-3" />
      ) : null}
    </div>
  )
}
