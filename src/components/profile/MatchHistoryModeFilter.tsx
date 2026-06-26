import { cn } from '@/lib/utils'
import {
  MATCH_HISTORY_MODE_LABELS,
  MATCH_HISTORY_MODES,
  type MatchHistoryMode,
} from '@/types/matchMode'

export interface MatchHistoryModeFilterProps {
  value: MatchHistoryMode
  onChange: (mode: MatchHistoryMode) => void
  className?: string
}

export function MatchHistoryModeFilter({
  value,
  onChange,
  className,
}: MatchHistoryModeFilterProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap gap-1.5',
        className,
      )}
      role="tablist"
      aria-label="전적 모드 필터"
    >
      {MATCH_HISTORY_MODES.map((mode) => {
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(mode)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border/60 bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {MATCH_HISTORY_MODE_LABELS[mode]}
          </button>
        )
      })}
    </div>
  )
}
