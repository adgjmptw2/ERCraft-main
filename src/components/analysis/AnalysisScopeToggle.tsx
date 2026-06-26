import { cn } from '@/lib/utils'
import type { AnalysisScope } from '@/utils/analysisAggregation'

export interface AnalysisScopeToggleProps {
  value: AnalysisScope
  onChange: (scope: AnalysisScope) => void
  className?: string
}

const OPTIONS: { value: AnalysisScope; label: string }[] = [
  { value: 'recent20', label: '최근 20판' },
  { value: 'seasonAll', label: '시즌 전체' },
]

export function AnalysisScopeToggle({ value, onChange, className }: AnalysisScopeToggleProps) {
  return (
    <div
      className={cn(
        'flex h-7 rounded-full border p-0.5 transition-colors duration-150 ease-in-out',
        'border-border bg-muted/80 dark:border-[#1e293b] dark:bg-[#0f172a]',
        className,
      )}
      role="group"
      aria-label="집계 범위"
    >
      {OPTIONS.map((option) => {
        const isActive = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-2.5 text-xs transition-colors duration-150 ease-in-out',
              isActive
                ? 'border border-[#374151] bg-[#1e293b] font-medium text-white'
                : 'border border-transparent bg-transparent font-normal text-[#6b7280] hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
