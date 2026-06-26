import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from 'recharts'

import type { AnalysisAxisRow } from '@/analysis/analysisTabViewModel'
import { formatAnalysisScore } from '@/analysis/analysisFormatters'
import { scoreBarColor } from '@/components/analysis/playStyleRadarDemo'
import { SurfaceCard } from '@/components/shared'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

/** Recharts SVG는 CSS 변수를 해석하지 못해 fill/stroke가 검은색으로 나올 수 있음 */
const RADAR_THEME = {
  light: {
    grid: '#e5e7eb',
    axis: '#1a1a1a',
    tierAvg: 'rgba(75, 85, 99, 0.85)',
    tierAvgFill: 'rgba(75, 85, 99, 0.18)',
    player: '#f97316',
    playerFill: 'rgba(249, 115, 22, 0.22)',
  },
  dark: {
    grid: '#2a2a2a',
    axis: '#ffffff',
    tierAvg: 'rgba(180, 190, 205, 0.85)',
    tierAvgFill: 'rgba(180, 190, 205, 0.16)',
    player: '#fb923c',
    playerFill: 'rgba(251, 146, 60, 0.18)',
  },
} as const

export interface AnalysisRadarCardProps {
  nickname: string
  chartData: { subject: string; value: number; tierAvg: number; fullMark: number }[]
  axisRows: AnalysisAxisRow[]
  embedded?: boolean
  className?: string
}

function RadarLegend({
  nickname,
  playerColor,
  tierAvgColor,
}: {
  nickname: string
  playerColor: string
  tierAvgColor: string
}) {
  return (
    <div className="absolute right-2 bottom-2 flex flex-col items-end gap-1 text-[10px]">
      <div className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-sm"
          style={{ backgroundColor: playerColor }}
          aria-hidden
        />
        <span className="text-foreground max-w-[6rem] truncate font-medium">{nickname}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-sm border bg-transparent"
          style={{ borderColor: tierAvgColor }}
          aria-hidden
        />
        <span className="text-muted-foreground">비교 중앙값</span>
      </div>
    </div>
  )
}

function AnalysisAxisRowItem({ row }: { row: AnalysisAxisRow }) {
  const [open, setOpen] = useState(false)
  const hasDetail = row.detail.trim().length > 0

  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{row.label}</span>
        <span className="text-foreground font-bold tabular-nums">
          {formatAnalysisScore(row.score)}
        </span>
      </div>
      <div className="bg-border/80 h-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${row.score}%`, backgroundColor: scoreBarColor(row.score) }}
        />
      </div>
      <p className="text-muted-foreground text-[10px] leading-relaxed break-words">
        {row.summary}
      </p>
      {row.sampleNote ? (
        <p className="text-muted-foreground/80 text-[9px] leading-relaxed">{row.sampleNote}</p>
      ) : null}
      {hasDetail ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-[9px] transition-colors"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
          상세 보기
        </button>
      ) : null}
      {open && hasDetail ? (
        <p className="text-muted-foreground/90 border-border/60 whitespace-pre-line rounded-md border bg-muted/20 p-2 text-[9px] leading-relaxed break-words">
          {row.detail}
        </p>
      ) : null}
    </li>
  )
}

export function AnalysisRadarCard({
  nickname,
  chartData,
  axisRows,
  embedded = false,
  className,
}: AnalysisRadarCardProps) {
  const { theme } = useTheme()
  const colors = RADAR_THEME[theme]

  const content = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,11rem)] lg:items-center">
        <div
          className="relative mx-auto flex w-full max-w-[250px] items-center justify-center"
          role="img"
          aria-label={`${nickname} 플레이 레이더 차트`}
        >
          <RadarChart width={240} height={240} data={chartData} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid stroke={colors.grid} />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: colors.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Radar
              dataKey="tierAvg"
              stroke={colors.tierAvg}
              fill={colors.tierAvgFill}
              fillOpacity={1}
              strokeWidth={1.75}
              dot={false}
            />
            <Radar
              dataKey="value"
              stroke={colors.player}
              fill={colors.playerFill}
              strokeWidth={2}
              dot={false}
            />
          </RadarChart>
          <RadarLegend
            nickname={nickname}
            playerColor={colors.player}
            tierAvgColor={colors.tierAvg}
          />
        </div>

        <ul className="space-y-2">
          {axisRows.map((row) => (
            <AnalysisAxisRowItem key={row.axis} row={row} />
          ))}
        </ul>
      </div>
  )

  if (embedded) {
    return <div className={cn('flex h-full flex-col gap-4', className)}>{content}</div>
  }

  return (
    <SurfaceCard variant="elevated" padding="md" className={cn('flex h-full flex-col gap-4', className)}>
      <div className="space-y-1">
        <h3 className="text-foreground text-sm font-semibold">플레이 레이더</h3>
        <p className="text-muted-foreground text-[11px]">
          최근 랭크 경기 6축 분석 점수
        </p>
      </div>
      {content}
    </SurfaceCard>
  )
}
