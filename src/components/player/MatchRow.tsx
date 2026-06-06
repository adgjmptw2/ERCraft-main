import { cn } from '@/lib/utils'
import type { MatchSummaryDTO } from '@/types/match'

export interface MatchRowProps {
  match: MatchSummaryDTO
}

export function MatchRow({ match }: MatchRowProps) {
  return (
    <li
      className={cn(
        'space-y-1.5 rounded-md border border-border px-3 py-2.5',
        match.victory
          ? 'border-l-4 border-l-emerald-500 bg-emerald-500/5'
          : 'border-border bg-card',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 font-medium break-all">{match.characterName}</p>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
            match.victory
              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {match.victory ? '승리' : '패배'}
        </span>
      </div>
      <p className="text-sm break-words">
        {match.placementLabel} · KDA {match.kdaString}
      </p>
      <p className="text-muted-foreground text-xs">{match.relativeTime}</p>
    </li>
  )
}
