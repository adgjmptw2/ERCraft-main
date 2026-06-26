import { cn } from '@/lib/utils'

export interface AnalysisInsightChipProps {
  label: string
  variant: 'strength' | 'improvement'
  className?: string
}

export function AnalysisInsightChip({ label, variant, className }: AnalysisInsightChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        variant === 'strength'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        className,
      )}
    >
      {label}
    </span>
  )
}
