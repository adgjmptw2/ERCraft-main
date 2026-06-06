import { GradeBadge } from '@/components/analysis/GradeBadge'
import type { MetricComparison } from '@/analysis/types'

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
    <article className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-medium">{metric.label}</h4>
        <GradeBadge grade={metric.grade} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-muted-foreground">내 값</dt>
          <dd className="font-medium">{formatValue(metric.key, metric.playerValue)}</dd>
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
      <p className="text-muted-foreground mt-2 text-xs">{metric.description}</p>
    </article>
  )
}
