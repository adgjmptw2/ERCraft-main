import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerAnalysisReport } from '@/analysis/types'
import type { AnalysisTabMeta } from '@/analysis/analysisTabMeta'
import type { PlayerPlayStyleAnalysis } from '@/analysis/playStyleTypes'
import type { AnalysisEligibilityResult } from '@/analysis/analysisEligibility'
import { AnalysisTabLayout } from '@/components/analysis/tab'
import type { MatchSummary } from '@/types/match'
import type { PlayerAnalysisResponseDTO } from '@/types/playerAnalysis'
import type { ProductionAnalysisAxesDTO, TeamPerformanceSummaryDTO } from '@/types/player'
import type { AnalysisScope } from '@/utils/analysisAggregation'

export interface ProfileAnalysisTabProps {
  nickname: string
  analysisReport: PlayerAnalysisReport | null
  analysisCharacterReports: CharacterAnalysisReport[]
  analysisMatches: MatchSummary[]
  populationMatchSets: MatchSummary[][]
  tierPopulationMatchSets: MatchSummary[][]
  populationMatches: MatchSummary[]
  analysisBasisLabel: string
  analysisTabMeta?: AnalysisTabMeta | null
  characterStatsBasisLabel?: string
  productionAxes?: ProductionAnalysisAxesDTO | null
  teamPerformanceSummary?: TeamPerformanceSummaryDTO | null
  analysisEligibility?: AnalysisEligibilityResult | null
  analysisSeasonMatches?: MatchSummary[]
  acceptLoadedSeasonFallback?: boolean
  seasonNumber?: number
  analysisScope: AnalysisScope
  onAnalysisScopeChange: (scope: AnalysisScope) => void
  showAnalysisScopeToggle: boolean
  playStyleAnalysis: PlayerPlayStyleAnalysis | null
  profileOwnerKey?: string
  playerAnalysis?: PlayerAnalysisResponseDTO | null
}

export function ProfileAnalysisTab({
  nickname,
  analysisReport,
  analysisCharacterReports,
  analysisMatches,
  populationMatchSets,
  tierPopulationMatchSets,
  populationMatches,
  analysisBasisLabel,
  analysisTabMeta,
  characterStatsBasisLabel,
  productionAxes = null,
  teamPerformanceSummary = null,
  analysisEligibility = null,
  analysisSeasonMatches,
  acceptLoadedSeasonFallback = false,
  seasonNumber,
  analysisScope,
  onAnalysisScopeChange,
  showAnalysisScopeToggle,
  playStyleAnalysis,
  profileOwnerKey,
  playerAnalysis = null,
}: ProfileAnalysisTabProps) {
  return (
    <AnalysisTabLayout
      nickname={nickname}
      playStyleAnalysis={playStyleAnalysis}
      analysisReport={analysisReport}
      characterReports={analysisCharacterReports}
      analysisMatches={analysisMatches}
      populationMatchSets={populationMatchSets}
      tierPopulationMatchSets={tierPopulationMatchSets}
      populationMatches={populationMatches}
      basisLabel={analysisBasisLabel}
      analysisTabMeta={analysisTabMeta}
      characterStatsBasisLabel={characterStatsBasisLabel}
      productionAxes={productionAxes}
      teamPerformanceSummary={teamPerformanceSummary}
      analysisEligibility={analysisEligibility}
      analysisSeasonMatches={analysisSeasonMatches}
      acceptLoadedSeasonFallback={acceptLoadedSeasonFallback}
      seasonNumber={seasonNumber}
      profileOwnerKey={profileOwnerKey}
      analysisScope={analysisScope}
      showScopeToggle={showAnalysisScopeToggle}
      onScopeChange={onAnalysisScopeChange}
      playerAnalysis={playerAnalysis}
    />
  )
}
