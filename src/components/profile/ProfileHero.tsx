import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

import type { DemoRankingPosition } from '@/mocks/loader'
import type { PlayerSummary } from '@/types/player'
import { isRealMode } from '@/api/erClient'
import { DemoDataNotice, SurfaceCard, TierBadge } from '@/components/shared'
import { cn } from '@/lib/utils'

export interface ProfileHeroProps {
  summary: PlayerSummary
  rankingPosition: DemoRankingPosition | null
  selectedTier: string
  tierDetail?: string
  showRankDetails?: boolean
  rp?: number
  onRefresh?: () => void
  isRefreshing?: boolean
  refreshError?: string | null
  refreshStatusMessage?: string | null
  freshnessLabel?: string | null
  canRefresh?: boolean
}

export function ProfileHero({
  summary,
  rankingPosition,
  selectedTier,
  tierDetail,
  showRankDetails = true,
  rp,
  onRefresh,
  isRefreshing = false,
  refreshError = null,
  refreshStatusMessage = null,
  freshnessLabel = null,
  canRefresh = false,
}: ProfileHeroProps) {
  const rankingLabel = rankingPosition
    ? `데모 RP #${rankingPosition.position}`
    : null

  const showRefreshButton = canRefresh && onRefresh != null
  const showMockRefreshHint = !isRealMode()

  return (
    <SurfaceCard
      variant="accent"
      padding="lg"
      className="relative overflow-hidden p-3 sm:p-5 lg:p-6"
    >
      <div className="from-primary/5 pointer-events-none absolute inset-0 bg-gradient-to-r via-transparent to-transparent" />
      <div className="relative space-y-3 sm:space-y-4">
        <div className="min-w-0 space-y-2">
          <Link
            className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            to="/"
          >
            ← 검색으로
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-foreground text-xl font-bold tracking-tight break-all sm:text-2xl lg:text-3xl">
              {summary.nickname}
            </h1>
            <span className="text-muted-foreground text-sm tabular-nums">
              Lv.{summary.level ?? '-'}
            </span>
            {isRealMode() ? (
              <TierBadge tier={selectedTier} />
            ) : showRankDetails ? (
              tierDetail ? (
                <span className="text-foreground text-sm font-semibold tabular-nums sm:text-base">
                  {tierDetail}
                </span>
              ) : (
                <>
                  <TierBadge tier={selectedTier} />
                  {rp != null ? (
                    <span className="text-foreground text-base font-extrabold tabular-nums sm:text-lg">
                      RP {rp.toLocaleString('ko-KR')}
                    </span>
                  ) : null}
                </>
              )
            ) : (
              <TierBadge tier={selectedTier} />
            )}
            {rankingLabel ? (
              <span className="text-muted-foreground text-xs sm:text-sm">{rankingLabel}</span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {!isRealMode() ? <DemoDataNotice compact /> : null}
              {showRefreshButton ? (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  aria-busy={isRefreshing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin')} />
                  {isRefreshing ? '갱신 중...' : '전적 갱신'}
                </button>
              ) : null}
              {showMockRefreshHint ? (
                <span className="text-muted-foreground text-xs">
                  데모 데이터는 갱신할 수 없습니다
                </span>
              ) : null}
              {!isRefreshing && freshnessLabel && !refreshError ? (
                <span className="text-muted-foreground text-[10px] tabular-nums">
                  {freshnessLabel}
                </span>
              ) : null}
            </div>
            {refreshError ? (
              <p className="text-destructive text-xs" role="alert">
                {refreshError}
              </p>
            ) : refreshStatusMessage ? (
              <p className="text-muted-foreground text-xs">{refreshStatusMessage}</p>
            ) : null}
          </div>
        </div>
      </div>
    </SurfaceCard>
  )
}
