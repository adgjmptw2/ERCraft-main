import { GradeBadge } from '@/components/analysis/GradeBadge'
import type { MetricComparison } from '@/analysis/types'
import { SurfaceCard } from '@/components/shared/SurfaceCard'

function formatValue(key: MetricComparison['key'], value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-'
  if (key === 'top3Rate' || key === 'winRate') return `${value.toFixed(1)}%`
  if (key === 'avgPlacement') return value.toFixed(2)
  return value.toFixed(2)
}

export interface MetricComparisonCardProps {
  metric: MetricComparison
  baselineLabel: string
}

export function MetricComparisonCard({ metric, baselineLabel }: MetricComparisonCardProps) {
  return (
    <SurfaceCard padding="md" className="text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-foreground min-w-0 flex-1 font-medium">{metric.label}</h4>
        <GradeBadge grade={metric.grade} className="shrink-0" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">내 값</dt>
          <dd className="text-base font-semibold">{formatValue(metric.key, metric.playerValue)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{baselineLabel}</dt>
          <dd>{formatValue(metric.key, metric.populationMean)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">샘플 대비 백분위</dt>
          <dd>
            {metric.percentile != null ? `${metric.percentile.toFixed(0)}%` : '데이터 없음'}
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed break-words">
        {metric.description}
      </p>
    </SurfaceCard>
  )
}
