import { useMemo, useState } from 'react'

import { EmptyState, SectionHeader, SurfaceCard } from '@/components/shared'
import type { RpTrendPoint } from '@/mocks/loader'
import {
  buildRpChartGeometry,
  diamondPath,
  RP_CHART_LAYOUTS,
  RP_CHART_LINE_COLOR,
  type RpChartLayout,
} from '@/components/profile/rpChartGeometry'
import type { RpChartState } from '@/utils/rpSeries'
import { RP_TREND_DESCRIPTION } from '@/utils/rpTrendPoints'
import { cn } from '@/lib/utils'

export interface RpTrendCardProps {
  points: RpTrendPoint[]
  chartState?: RpChartState
  title?: string
  description?: string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  embedded?: boolean
  compact?: boolean
  size?: keyof typeof RP_CHART_LAYOUTS
}

interface TooltipAnchor {
  point: RpTrendPoint
  xPercent: number
  yPercent: number
  placeBelow: boolean
}

function RpTrendTooltip({ anchor }: { anchor: TooltipAnchor }) {
  const { point } = anchor
  const showRange = point.dayMinRp != null && point.dayMaxRp != null

  return (
    <div
      className="border-border/70 bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max max-w-[11rem] rounded-md border px-2 py-1.5 text-[10px] leading-snug shadow-sm"
      style={{
        left: `${anchor.xPercent}%`,
        top: `${anchor.yPercent}%`,
        transform: anchor.placeBelow ? 'translate(-50%, 10px)' : 'translate(-50%, calc(-100% - 10px))',
      }}
    >
      <p className="text-muted-foreground font-medium">{point.dateLabel}</p>
      <p className="text-foreground mt-0.5 font-semibold whitespace-nowrap tabular-nums">
        마무리 {point.rpAfter.toLocaleString('ko-KR')}
      </p>
      {showRange ? (
        <p className="text-muted-foreground mt-0.5 whitespace-nowrap tabular-nums">
          최저 {point.dayMinRp!.toLocaleString('ko-KR')} · 최고 {point.dayMaxRp!.toLocaleString('ko-KR')}
        </p>
      ) : null}
      {point.gamesPlayed != null && point.gamesPlayed > 1 ? (
        <p className="text-muted-foreground/80 mt-0.5 tabular-nums">{point.gamesPlayed}판</p>
      ) : null}
    </div>
  )
}

export function RpTrendCard({
  points,
  chartState,
  title = 'RP 추이',
  description = RP_TREND_DESCRIPTION,
  emptyTitle = 'RP 흐름 데이터 없음',
  emptyDescription = '최근 경기 RP 기록이 없습니다.',
  className,
  embedded = false,
  compact = false,
  size = 'default',
}: RpTrendCardProps) {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null)
  const layout: RpChartLayout = RP_CHART_LAYOUTS[size]
  const isSidebar = size === 'sidebar'

  const resolvedState: RpChartState =
    chartState ?? (points.length >= 2 ? 'ready' : points.length === 0 ? 'unavailable' : 'insufficientData')
  const hasChart = resolvedState === 'ready' && points.length >= 2
  const geometry = useMemo(
    () => (hasChart ? buildRpChartGeometry(points, RP_CHART_LAYOUTS[size]) : null),
    [hasChart, points, size],
  )
  const latestRp = points.at(-1)?.rpAfter

  const showAnchor = (x: number, y: number, point: RpTrendPoint) => {
    if (!geometry) return
    const xPercent = (x / geometry.width) * 100
    const yPercent = (y / geometry.height) * 100
    const placeBelow = yPercent < 38
    const next: TooltipAnchor = { point, xPercent, yPercent, placeBelow }
    setAnchor((prev) =>
      prev?.point.matchId === next.point.matchId &&
      prev.xPercent === next.xPercent &&
      prev.placeBelow === next.placeBelow
        ? prev
        : next,
    )
  }

  const chartBody = !hasChart ? (
    <EmptyState title={emptyTitle} description={emptyDescription} />
  ) : (
    <div className={cn('space-y-2', compact && 'space-y-1')}>
      {!compact ? (
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-muted-foreground text-xs">최근 RP</p>
          <p className="text-foreground text-2xl font-bold tabular-nums tracking-tight">{latestRp}</p>
        </div>
      ) : (
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide">
          랭크 {points.length}일 · RP 추이
        </p>
      )}

      <div
        className={cn(
          'relative min-w-0',
          isSidebar ? 'overflow-hidden' : 'overflow-x-auto overflow-y-visible',
        )}
        onMouseLeave={() => setAnchor(null)}
      >
        {anchor ? <RpTrendTooltip anchor={anchor} /> : null}

        <svg
          viewBox={`0 0 ${geometry!.width} ${geometry!.height}`}
          className={cn('h-auto w-full max-w-full', isSidebar ? 'min-w-0' : 'min-w-[260px]')}
          role="img"
          aria-label="최근 RP 추이 차트"
        >
          {geometry!.yTicks.map(({ value, y }) => (
            <g key={value}>
              <line
                x1={geometry!.padding.left}
                y1={y}
                x2={geometry!.width - geometry!.padding.right}
                y2={y}
                stroke="currentColor"
                className="text-border/50"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              <text
                x={geometry!.padding.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground tabular-nums"
                fontSize={layout.labelSize}
              >
                {value.toLocaleString('ko-KR')}
              </text>
            </g>
          ))}

          <line
            x1={geometry!.padding.left}
            y1={geometry!.padding.top}
            x2={geometry!.padding.left}
            y2={geometry!.baselineY}
            stroke="currentColor"
            className="text-border/60"
            strokeWidth="1"
            strokeDasharray="2 4"
          />

          <path
            d={geometry!.linePath}
            fill="none"
            stroke={RP_CHART_LINE_COLOR}
            strokeWidth={layout.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {geometry!.coords.map(({ x, y, point }) => {
            const isActive = anchor?.point.matchId === point.matchId
            const markerR = layout.markerSize
            return (
              <g
                key={point.matchId}
                className="cursor-default"
                onMouseEnter={() => showAnchor(x, y, point)}
              >
                <title>
                  {[
                    point.dateLabel,
                    `마무리 ${point.rpAfter.toLocaleString('ko-KR')}`,
                    point.dayMinRp != null && point.dayMaxRp != null
                      ? `최저 ${point.dayMinRp.toLocaleString('ko-KR')} · 최고 ${point.dayMaxRp.toLocaleString('ko-KR')}`
                      : null,
                    point.gamesPlayed != null && point.gamesPlayed > 1 ? `${point.gamesPlayed}판` : null,
                  ]
                    .filter(Boolean)
                    .join('\n')}
                </title>
                <path d={diamondPath(x, y, markerR + 6)} fill="transparent" />
                <path
                  d={diamondPath(x, y, isActive ? layout.activeMarkerSize : markerR)}
                  fill={RP_CHART_LINE_COLOR}
                  stroke="#1a1f2e"
                  strokeWidth={isActive ? 1.5 : 1}
                  opacity={isActive ? 1 : 0.85}
                />
              </g>
            )
          })}

          {geometry!.coords.map(({ x, point }) => (
            <text
              key={`${point.matchId}-label`}
              x={x}
              y={geometry!.height - 4}
              textAnchor="middle"
              className="fill-muted-foreground tabular-nums"
              fontSize={layout.labelSize}
            >
              {point.dateLabel}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )

  if (embedded) {
    return <div className={cn('space-y-1', className)}>{chartBody}</div>
  }

  return (
    <SurfaceCard variant="default" padding="lg" className={cn('space-y-4', className)}>
      <SectionHeader title={title} description={description} size="default" />
      {chartBody}
    </SurfaceCard>
  )
}
