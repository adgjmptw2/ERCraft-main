import type { ReactNode } from 'react'
import { useMemo } from 'react'

import { MatchRow } from '@/components/player/MatchRow'
import { useIdleMatchDetailPrefetch } from '@/hooks/useIdleMatchDetailPrefetch'
import { EmptyState, SectionHeader, SkeletonCard, SourceBadge } from '@/components/shared'
import { isRealMode } from '@/api/erClient'
import { Button } from '@/components/ui/button'
import type { DataSource } from '@/types/api'
import type { MatchSummaryDTO } from '@/types/match'
import { PROFILE_MATCHES_SECTION_ERROR } from '@/utils/playerError'
import { summarizeMatchHighlights } from '@/utils/matchHighlight'
import { SurfaceCard } from '@/components/shared/SurfaceCard'

export interface RecentMatchListProps {
  matches: MatchSummaryDTO[]
  matchesSource?: DataSource
  isPending: boolean
  isError: boolean
  error: unknown
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  modeFilter?: ReactNode
  emptyDescription?: string
}

export function RecentMatchList({
  matches,
  matchesSource,
  isPending,
  isError,
  error: _error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  modeFilter,
  emptyDescription,
}: RecentMatchListProps) {
  const realMode = isRealMode()
  const highlightSummary = useMemo(() => summarizeMatchHighlights(matches), [matches])
  const prefetchGameIds = useMemo(() => matches.map((match) => match.matchId), [matches])
  useIdleMatchDetailPrefetch(prefetchGameIds, !isPending && !isError && matches.length > 0)

  return (
    <SurfaceCard
      padding="lg"
      className="flex h-full min-h-0 min-w-0 flex-col gap-5 px-2 py-5 sm:px-5 md:px-6"
    >
      <SectionHeader
        title="최근 매치"
        badge={
          <>
            {highlightSummary.mvpMatches > 0 ? (
              <span
                className="match-list__sparkle-summary"
                title={`표시 중 ${highlightSummary.matchCount}경기 기준`}
              >
                MVP {highlightSummary.mvpMatches}판
              </span>
            ) : null}
            {!realMode && matchesSource ? <SourceBadge source={matchesSource} /> : null}
          </>
        }
      />
      {modeFilter ? <div className="min-w-0">{modeFilter}</div> : null}
      {isPending ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : isError ? (
        <EmptyState
          title="전적 정보를 불러오지 못했습니다"
          description={PROFILE_MATCHES_SECTION_ERROR}
        />
      ) : matches.length === 0 ? (
        <EmptyState
          title="최근 매치 기록이 없습니다"
          description={emptyDescription}
        />
      ) : (
        <>
          <ul className="divide-border/60 flex min-w-0 flex-col divide-y [&>li]:min-w-0 [&>li]:py-1.5">
            {matches.map((m) => (
              <MatchRow key={m.matchId} match={m} variant="record" />
            ))}
          </ul>
          {hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isFetchingNextPage}
              onClick={onLoadMore}
            >
              {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
            </Button>
          ) : null}
        </>
      )}
    </SurfaceCard>
  )
}
