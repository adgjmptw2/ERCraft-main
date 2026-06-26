import { AnalysisRoleBadge } from '@/components/analysis/tab/AnalysisRoleBadge'
import { AnalysisScopeToggle } from '@/components/analysis/AnalysisScopeToggle'
import { SurfaceCard } from '@/components/shared'
import type { AnalysisScope } from '@/utils/analysisAggregation'
import { cn } from '@/lib/utils'

export interface AnalysisHeaderProps {
  sourceLabel: string
  sampleLabel: string
  basisLabel: string
  seasonSourceLabel?: string
  seasonSampleLabel?: string
  seasonConfidenceLabel?: string
  trendBasisLabel?: string
  sampleBasisNote?: string | null
  scopeNote?: string | null
  showScopeSplit?: boolean
  headline: string
  referenceScoreLabel?: string | null
  insightLine: string
  estimatedTendency: string | null
  secondaryTendency: string | null
  confidenceLabel: string
  readyMetricCount: number
  disclaimer: string
  scope: AnalysisScope
  showScopeToggle: boolean
  onScopeChange: (scope: AnalysisScope) => void
  className?: string
}

export function AnalysisHeader({
  sourceLabel,
  sampleLabel,
  basisLabel,
  seasonSourceLabel,
  seasonSampleLabel,
  seasonConfidenceLabel,
  trendBasisLabel,
  sampleBasisNote,
  scopeNote,
  showScopeSplit = false,
  headline,
  referenceScoreLabel,
  insightLine,
  estimatedTendency,
  secondaryTendency,
  confidenceLabel,
  disclaimer,
  scope,
  showScopeToggle,
  onScopeChange,
  className,
}: AnalysisHeaderProps) {
  const seasonSource = seasonSourceLabel ?? sourceLabel
  const seasonSample = seasonSampleLabel ?? sampleLabel
  const seasonConfidence = seasonConfidenceLabel ?? confidenceLabel

  return (
    <SurfaceCard variant="accent" padding="md" className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {showScopeSplit ? (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-primary/90 text-[11px] font-semibold tracking-wide uppercase">
                  시즌 데이터
                </p>
                <span className="text-muted-foreground text-[11px]">
                  · {seasonSource}
                  · {seasonSample}
                  {seasonConfidence ? ` · ${seasonConfidence}` : null}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-primary/90 text-[11px] font-semibold tracking-wide uppercase">
                  플레이 경향
                </p>
                <span className="text-muted-foreground text-[11px]">
                  · {sampleBasisNote ?? trendBasisLabel ?? '최근 경기 표본 부족'}
                </span>
              </div>
              {scopeNote ? (
                <p className="text-muted-foreground text-[10px] leading-relaxed">{scopeNote}</p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-primary/90 text-[11px] font-semibold tracking-wide uppercase">
                {sourceLabel}
              </p>
              <span className="text-muted-foreground text-[11px]">
                · {sampleLabel}
                {confidenceLabel ? ` · ${confidenceLabel}` : null}
              </span>
            </div>
          )}
          {!showScopeSplit && basisLabel !== sourceLabel ? (
            <p className="text-muted-foreground text-[10px]">{basisLabel}</p>
          ) : null}
          <h2 className="text-foreground text-lg font-bold tracking-tight sm:text-xl">{headline}</h2>
          {referenceScoreLabel ? (
            <p className="text-muted-foreground text-[11px]">{referenceScoreLabel}</p>
          ) : null}
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{insightLine}</p>
        </div>
        {showScopeToggle ? (
          <AnalysisScopeToggle value={scope} onChange={onScopeChange} />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {estimatedTendency ? (
          <AnalysisRoleBadge label={estimatedTendency} variant="primary" />
        ) : null}
        {secondaryTendency ? <AnalysisRoleBadge label={secondaryTendency} /> : null}
      </div>

      <p className="text-muted-foreground border-border/50 border-t pt-2 text-[11px] leading-relaxed">
        {disclaimer}
      </p>
    </SurfaceCard>
  )
}
