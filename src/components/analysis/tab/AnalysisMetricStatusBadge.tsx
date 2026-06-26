import type { AnalysisMetricAvailability, AnalysisMetricStatus } from '@/analysis/metricTypes'
import { getStatusBadgeLabel } from '@/analysis/analysisUiLabels'
import { cn } from '@/lib/utils'

export interface AnalysisMetricStatusBadgeProps {
  status: AnalysisMetricStatus
  availability?: AnalysisMetricAvailability
  className?: string
}

const statusClass: Record<AnalysisMetricStatus, string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  unavailable: 'border-border bg-muted/60 text-muted-foreground',
  future: 'border-sky-500/25 bg-sky-500/8 text-sky-900 dark:text-sky-200',
}

export function AnalysisMetricStatusBadge({
  status,
  availability,
  className,
}: AnalysisMetricStatusBadgeProps) {
  const label = getStatusBadgeLabel(status, availability)
  if (!label) return null

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        statusClass[status],
        className,
      )}
    >
      {label}
    </span>
  )
}
