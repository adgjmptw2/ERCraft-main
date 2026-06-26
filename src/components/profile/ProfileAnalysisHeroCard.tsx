import type { DemoPlayerCompactSummary } from '@/mocks/loader'
import type { RpTrendPoint } from '@/mocks/loader'
import type { RpChartViewModel } from '@/utils/rpSeries'
import type { SeasonRank } from '@/types/rank'
import type { PlayerAnalysisReport } from '@/analysis/types'
import { ProfileCompactSummary } from '@/components/profile/ProfileCompactSummary'
import { RpTrendCard } from '@/components/profile/RpTrendCard'
import { SurfaceCard } from '@/components/shared'
import { tierBadgeUrl } from '@/utils/assetUrls'
import { formatTierBadge, tierAccentColor } from '@/utils/rankTier'
import { cn } from '@/lib/utils'

export interface ProfileAnalysisHeroCardProps {
  seasonNumber: number
  rank: SeasonRank
  wins?: number
  losses?: number
  winRate?: number
  rpTrend: RpTrendPoint[]
  rpChart?: RpChartViewModel
  /** false면 RP 추이 카드 미표시 (real 현재 시즌 정책) */
  showRpTrend?: boolean
  compactSummary: DemoPlayerCompactSummary | null
  overallReport?: PlayerAnalysisReport | null
  /** sidebar — 전적 탭 좌측 카드 폭에 맞춤 */
  variant?: 'default' | 'sidebar'
  hideOverallGrade?: boolean
  className?: string
}

export function ProfileAnalysisHeroCard({
  seasonNumber,
  rank,
  wins,
  losses,
  winRate,
  rpTrend,
  rpChart,
  showRpTrend = true,
  compactSummary,
  overallReport,
  variant = 'default',
  hideOverallGrade = false,
  className,
}: ProfileAnalysisHeroCardProps) {
  const isSidebar = variant === 'sidebar'
  const tierLabel = formatTierBadge(rank)
  const accent = tierAccentColor(rank.tier)
  const tierImageUrl = tierBadgeUrl(tierLabel)
  const hasRecord = typeof wins === 'number' && typeof losses === 'number'
  const winsCount = hasRecord ? wins : null
  const lossesCount = hasRecord ? losses : null
  const totalGames =
    winsCount != null && lossesCount != null ? winsCount + lossesCount : null
  const resolvedWinRate =
    typeof winRate === 'number'
      ? winRate
      : totalGames != null && totalGames > 0 && winsCount != null
        ? Math.round((winsCount / totalGames) * 100)
        : null
  const showOverall = !hideOverallGrade && overallReport?.overallPerformanceScore != null
  const confidenceLabel = (() => {
    switch (overallReport?.overallConfidenceLabel) {
      case 'high':
        return '신뢰도 높음'
      case 'medium':
        return '신뢰도 보통'
      case 'low':
        return '신뢰도 낮음'
      case 'insufficient':
        return '표본 부족'
      default:
        return null
    }
  })()

  return (
    <SurfaceCard
      padding="md"
      className={cn('min-w-0 space-y-0', isSidebar && 'w-full max-w-full', className)}
    >
      <section
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3"
        aria-label={`S${seasonNumber} 랭크 요약`}
      >
        <div className="flex size-14 shrink-0 items-center justify-center sm:size-16">
          {tierImageUrl ? (
            <img
              src={tierImageUrl}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="border-border bg-muted size-12 rounded-md border" aria-hidden />
          )}
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="bg-muted text-foreground inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-bold tabular-nums">
                S{seasonNumber}
              </span>
              <h2
                className="truncate text-lg font-extrabold tracking-normal sm:text-xl"
                style={{ color: accent }}
              >
                {tierLabel}
              </h2>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
              {rank.rp.toLocaleString('ko-KR')} RP
              {rank.rank != null ? ` · #${rank.rank.toLocaleString('ko-KR')}` : ''}
            </p>
          </div>

          <dl className="text-muted-foreground grid shrink-0 gap-1 text-right text-xs tabular-nums">
            <div>
              <dt className="sr-only">판수</dt>
              <dd>{totalGames != null ? `${totalGames}판` : '-판'}</dd>
            </div>
            <div>
              <dt className="sr-only">승률</dt>
              <dd>승률 {resolvedWinRate != null ? `${Math.round(resolvedWinRate)}%` : '-'}</dd>
            </div>
            {showOverall ? (
              <div>
                <dt className="sr-only">종합 성과 등급</dt>
                <dd>
                  종합 {overallReport?.overallGrade ?? '-'} ·{' '}
                  {Math.round(overallReport?.overallPerformanceScore ?? 0)}점
                </dd>
              </div>
            ) : !hideOverallGrade ? (
              <div>
                <dt className="sr-only">종합 등급</dt>
                <dd>종합 등급 -</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {showOverall ? (
        <div className="border-border/60 mt-3 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-foreground text-sm font-semibold">종합 성과 등급</p>
            <p className="text-muted-foreground text-xs">{confidenceLabel}</p>
          </div>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            캐릭터별 성과를 기본으로 하고, 이번 시즌 결과와 경기 일관성을 보정한 점수입니다.
          </p>
          {overallReport?.basePerformanceScore != null ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">기본 캐릭터 성과</dt>
                <dd>{overallReport.basePerformanceScore.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">결과 성과 보정</dt>
                <dd>{(overallReport.outcomeModifier ?? 0).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">일관성 보정</dt>
                <dd>{(overallReport.consistencyModifier ?? 0).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between gap-2 font-semibold">
                <dt>최종 종합 점수</dt>
                <dd>{overallReport.overallPerformanceScore?.toFixed(2)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {showRpTrend ? (
        <>
          <div className="border-border/60 my-2.5 border-t sm:my-3" aria-hidden />

          <RpTrendCard
            points={rpChart?.points ?? rpTrend}
            chartState={rpChart?.state}
            title={rpChart?.title}
            description={rpChart?.description}
            emptyTitle={rpChart?.emptyTitle}
            emptyDescription={rpChart?.emptyDescription}
            embedded
            compact
            size={isSidebar ? 'sidebar' : 'default'}
          />
        </>
      ) : null}

      {compactSummary ? <ProfileCompactSummary summary={compactSummary} /> : null}
    </SurfaceCard>
  )
}
