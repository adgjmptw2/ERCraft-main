import type { AnalysisMetricSectionModel } from '@/analysis/analysisTabViewModel'
import { AnalysisMetricCard } from '@/components/analysis/tab/AnalysisMetricCard'
import { cn } from '@/lib/utils'

export interface AnalysisMetricSectionProps {
  section: AnalysisMetricSectionModel
  className?: string
}

export function AnalysisMetricSection({ section, className }: AnalysisMetricSectionProps) {
  if (section.metrics.length === 0) return null

  return (
    <details
      open={section.defaultExpanded}
      className={cn(
        'border-border/60 group rounded-xl border bg-card/40',
        section.futureOnly && 'border-dashed',
        className,
      )}
    >
      <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-start justify-between gap-3 rounded-xl px-4 py-3 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-foreground text-sm font-semibold">{section.title}</h3>
          <p className="text-muted-foreground text-xs">{section.description}</p>
        </div>
        <span className="text-muted-foreground shrink-0 pt-0.5 text-[10px] group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div
        className={cn(
          'border-border/40 grid gap-3 border-t px-4 pt-3 pb-4',
          section.futureOnly
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
        )}
      >
        {section.metrics.map((card) => (
          <AnalysisMetricCard
            key={card.id}
            card={card}
            variant={section.futureOnly ? 'future' : card.isSecondary ? 'secondary' : 'default'}
          />
        ))}
      </div>
    </details>
  )
}
