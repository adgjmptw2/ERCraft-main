import { cn } from '@/lib/utils'

export interface SourceBadgeProps {
  source: 'external' | 'cache'
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const isCache = source === 'cache'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        isCache
          ? 'border-border bg-muted text-muted-foreground'
          : 'border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200',
      )}
    >
      {isCache ? '캐시' : '실시간'}
    </span>
  )
}
