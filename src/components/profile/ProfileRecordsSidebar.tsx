import type { CharacterAnalysisReport, PlayerAnalysisReport } from '@/analysis/types'
import type { DemoPlayerCompactSummary } from '@/mocks/loader'
import type { RpTrendPoint } from '@/mocks/loader'
import type { RpChartViewModel } from '@/utils/rpSeries'
import type { DemoSeasonSnapshot } from '@/mocks/seasonHistory'
import { CharacterStats } from '@/components/profile/CharacterStats'
import { ProfileAnalysisHeroCard } from '@/components/profile/ProfileAnalysisHeroCard'
import { SurfaceCard } from '@/components/shared'
import { cn } from '@/lib/utils'
import { isCobaltMatchHistoryMode, type MatchHistoryMode } from '@/types/matchMode'

export interface ProfileRecordsSidebarProps {
  seasonSnapshot: DemoSeasonSnapshot
  rpTrend: RpTrendPoint[]
  rpChart?: RpChartViewModel
  showRpTrend?: boolean
  compactSummary: DemoPlayerCompactSummary | null
  overallReport?: PlayerAnalysisReport | null
  characterReports: CharacterAnalysisReport[]
  userNum: number
  characterStatsSeasonNumber?: number
  characterStatsMode?: 'mock' | 'real'
  characterStatsBasisCount?: number
  characterStatsSourceLabel?: string | null
  characterStatsRefreshNotice?: string | null
  characterStatsRefreshPending?: boolean
  onRefreshCharacterStats?: () => void
  characterStatsPending?: boolean
  canLoadMoreMatches?: boolean
  loadMoreMatchesPending?: boolean
  loadMoreMatchesError?: string | null
  onLoadMoreMatches?: () => void
  matchHistoryMode?: MatchHistoryMode
  className?: string
}

export function ProfileRecordsSidebar({
  seasonSnapshot,
  rpTrend,
  rpChart,
  showRpTrend = true,
  compactSummary,
  overallReport,
  characterReports,
  characterStatsSeasonNumber,
  userNum,
  characterStatsMode = 'mock',
  characterStatsBasisCount,
  characterStatsSourceLabel,
  characterStatsRefreshNotice,
  characterStatsRefreshPending,
  onRefreshCharacterStats,
  characterStatsPending,
  canLoadMoreMatches,
  loadMoreMatchesPending,
  loadMoreMatchesError,
  onLoadMoreMatches,
  matchHistoryMode = 'all',
  className,
}: ProfileRecordsSidebarProps) {
  const hidesGrades = isCobaltMatchHistoryMode(matchHistoryMode)

  return (
    <aside className={cn('flex min-w-0 flex-col gap-3', className)}>
      <ProfileAnalysisHeroCard
        variant="sidebar"
        seasonNumber={seasonSnapshot.seasonNumber}
        rank={seasonSnapshot.rank}
        wins={seasonSnapshot.wins}
        losses={seasonSnapshot.losses}
        winRate={seasonSnapshot.winRate}
        rpTrend={rpTrend}
        rpChart={rpChart}
        showRpTrend={showRpTrend}
        compactSummary={compactSummary}
        overallReport={overallReport}
        hideOverallGrade={hidesGrades}
      />

      <SurfaceCard padding="md" className="min-w-0 px-2 py-4 md:px-3">
        <CharacterStats
          characterReports={characterReports}
          userNum={userNum}
          seasonNumber={characterStatsSeasonNumber ?? seasonSnapshot.seasonNumber}
          dataMode={characterStatsMode}
          basisMatchCount={characterStatsBasisCount}
          basisSourceLabel={characterStatsSourceLabel ?? undefined}
          refreshNotice={characterStatsRefreshNotice ?? undefined}
          refreshPending={characterStatsRefreshPending}
          onRefreshAggregate={onRefreshCharacterStats}
          isPending={characterStatsPending}
          canLoadMoreMatches={canLoadMoreMatches}
          loadMoreMatchesPending={loadMoreMatchesPending}
          loadMoreMatchesError={loadMoreMatchesError}
          onLoadMoreMatches={onLoadMoreMatches}
          hideGrades={hidesGrades}
        />
      </SurfaceCard>
    </aside>
  )
}
