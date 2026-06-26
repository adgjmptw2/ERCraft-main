import { cn } from '@/lib/utils'

export interface AnalysisRoleBadgeProps {
  label: string
  variant?: 'primary' | 'secondary'
  className?: string
}

export function AnalysisRoleBadge({
  label,
  variant = 'secondary',
  className,
}: AnalysisRoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
        variant === 'primary'
          ? 'bg-primary/12 text-primary border-primary/20 border'
          : 'bg-muted text-muted-foreground border-border/60 border',
        className,
      )}
    >
      {label}
    </span>
  )
}
