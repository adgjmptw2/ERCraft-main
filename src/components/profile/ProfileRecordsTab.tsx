import type { CharacterAnalysisReport, PlayerAnalysisReport } from '@/analysis/types'
import type { DemoPlayerCompactSummary } from '@/mocks/loader'
import type { RpTrendPoint } from '@/mocks/loader'
import type { RpChartViewModel } from '@/utils/rpSeries'
import type { DemoSeasonSnapshot } from '@/mocks/seasonHistory'
import type { MatchSummaryDTO } from '@/types/match'
import type { MatchHistoryMode } from '@/types/matchMode'
import type { DataSource } from '@/types/api'
import { MatchHistoryModeFilter } from '@/components/profile/MatchHistoryModeFilter'
import { ProfileRecordsSidebar } from '@/components/profile/ProfileRecordsSidebar'
import { RecentMatchList } from '@/components/player/RecentMatchList'

export interface ProfileRecordsTabProps {
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
  matchItems: MatchSummaryDTO[]
  matchesSource?: DataSource
  matchesPending: boolean
  matchesError: boolean
  matchesErrorObj: unknown
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  matchHistoryMode: MatchHistoryMode
  onMatchHistoryModeChange: (mode: MatchHistoryMode) => void
  matchesEmptyMessage?: string | null
}

export function ProfileRecordsTab({
  seasonSnapshot,
  rpTrend,
  rpChart,
  showRpTrend = true,
  compactSummary,
  overallReport,
  characterReports,
  characterStatsSeasonNumber,
  userNum,
  characterStatsMode,
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
  matchItems,
  matchesSource,
  matchesPending,
  matchesError,
  matchesErrorObj,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  matchHistoryMode,
  onMatchHistoryModeChange,
  matchesEmptyMessage,
}: ProfileRecordsTabProps) {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,35%)_minmax(0,65%)] lg:items-start lg:gap-8">
      <ProfileRecordsSidebar
        seasonSnapshot={seasonSnapshot}
        rpTrend={rpTrend}
        rpChart={rpChart}
        showRpTrend={showRpTrend}
        compactSummary={compactSummary}
        overallReport={overallReport}
        characterReports={characterReports}
        characterStatsSeasonNumber={characterStatsSeasonNumber}
        userNum={userNum}
        characterStatsMode={characterStatsMode}
        characterStatsBasisCount={characterStatsBasisCount}
        characterStatsSourceLabel={characterStatsSourceLabel}
        characterStatsRefreshNotice={characterStatsRefreshNotice}
        characterStatsRefreshPending={characterStatsRefreshPending}
        onRefreshCharacterStats={onRefreshCharacterStats}
        characterStatsPending={characterStatsPending}
        canLoadMoreMatches={canLoadMoreMatches}
        loadMoreMatchesPending={loadMoreMatchesPending}
        loadMoreMatchesError={loadMoreMatchesError}
        onLoadMoreMatches={onLoadMoreMatches}
        matchHistoryMode={matchHistoryMode}
      />
      <RecentMatchList
        matches={matchItems}
        matchesSource={matchesSource}
        isPending={matchesPending}
        isError={matchesError}
        error={matchesErrorObj}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
        emptyDescription={matchesEmptyMessage ?? undefined}
        modeFilter={
          <MatchHistoryModeFilter
            value={matchHistoryMode}
            onChange={onMatchHistoryModeChange}
          />
        }
      />
    </div>
  )
}
