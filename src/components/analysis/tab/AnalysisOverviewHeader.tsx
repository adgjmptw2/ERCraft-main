import { AnalysisRoleBadge } from '@/components/analysis/tab/AnalysisRoleBadge'
import { AnalysisScopeToggle } from '@/components/analysis/AnalysisScopeToggle'
import { SurfaceCard } from '@/components/shared'
import type { AnalysisScope } from '@/utils/analysisAggregation'
import { cn } from '@/lib/utils'

interface HeaderStat {
  label: string
  value: string
  hint?: string
}

export interface AnalysisOverviewHeaderProps {
  basisLabel: string
  headline: string
  insightLine: string
  estimatedTendency: string | null
  secondaryTendency: string | null
  headerStats: HeaderStat[]
  analysisScore: number | null
  sampleSize: number
  dataConfidence: string
  scope: AnalysisScope
  showScopeToggle: boolean
  onScopeChange: (scope: AnalysisScope) => void
  className?: string
}

export function AnalysisOverviewHeader({
  basisLabel,
  headline,
  insightLine,
  estimatedTendency,
  secondaryTendency,
  headerStats,
  analysisScore,
  sampleSize,
  dataConfidence,
  scope,
  showScopeToggle,
  onScopeChange,
  className,
}: AnalysisOverviewHeaderProps) {
  return (
    <SurfaceCard variant="accent" padding="md" className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-primary/80 text-[11px] font-semibold tracking-widest uppercase">
            플레이 성향 분석
          </p>
          <h2 className="text-foreground text-lg font-bold tracking-tight sm:text-xl">{headline}</h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{insightLine}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {showScopeToggle ? (
            <AnalysisScopeToggle value={scope} onChange={onScopeChange} />
          ) : (
            <span className="text-muted-foreground text-xs">{basisLabel}</span>
          )}
          {analysisScore != null ? (
            <div className="text-right">
              <p className="text-muted-foreground text-[10px] uppercase">분석 점수</p>
              <p className="text-foreground text-2xl font-bold tabular-nums">{analysisScore}</p>
              <p className="text-muted-foreground text-[9px]">최근 경기 기준</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {estimatedTendency ? (
          <AnalysisRoleBadge label={estimatedTendency} variant="primary" />
        ) : null}
        {secondaryTendency ? <AnalysisRoleBadge label={secondaryTendency} /> : null}
        <span className="text-muted-foreground text-[11px]">
          {basisLabel} · {sampleSize}경기
          {dataConfidence === 'medium' ? ' · 표본 수집 중' : ''}
        </span>
      </div>

      {headerStats.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {headerStats.map((stat) => (
            <div
              key={stat.label}
              className="bg-background/60 border-border/50 rounded-lg border px-3 py-2"
            >
              <p className="text-muted-foreground text-[10px] font-medium">{stat.label}</p>
              <p className="text-foreground text-lg font-bold tabular-nums">{stat.value}</p>
              {stat.hint ? (
                <p className="text-muted-foreground text-[10px]">{stat.hint}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </SurfaceCard>
  )
}
