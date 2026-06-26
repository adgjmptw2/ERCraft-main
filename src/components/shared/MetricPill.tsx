import { cn } from '@/lib/utils'

export interface MetricPillProps {
  label: string
  value: string
  className?: string
  emphasis?: boolean
  trend?: 'up' | 'down' | null
}

export function MetricPill({ label, value, className, emphasis = false, trend = null }: MetricPillProps) {
  return (
    <div
      className={cn(
        'border-border/80 bg-background/70 inline-flex min-w-0 flex-col rounded-lg border px-3 py-2 shadow-sm',
        emphasis && 'border-primary/20 bg-primary/5 px-4 py-2.5',
        className,
      )}
    >
      <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase sm:text-xs">
        {label}
      </span>
      <span
        className={cn(
          'text-foreground font-bold tracking-tight',
          emphasis ? 'text-2xl font-extrabold sm:text-3xl' : 'text-sm font-semibold',
          trend === 'up' && 'text-green-400',
          trend === 'down' && 'text-red-400',
        )}
      >
        {value}
        {trend === 'up' ? (
          <span className="text-green-400 ml-1 text-xs font-bold" aria-hidden>
            ▲
          </span>
        ) : null}
        {trend === 'down' ? (
          <span className="text-red-400 ml-1 text-xs font-bold" aria-hidden>
            ▼
          </span>
        ) : null}
      </span>
    </div>
  )
}
