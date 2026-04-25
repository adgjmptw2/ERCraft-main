import { cn } from '@/lib/utils'
import type { MatchSummaryDTO } from '@/types/match'

export interface MatchRowProps {
  match: MatchSummaryDTO
}

export function MatchRow({ match }: MatchRowProps) {
  return (
    <li
      className={cn(
        'space-y-1 rounded-md border border-border px-3 py-2',
        match.victory
          ? 'border-l-4 border-l-emerald-500 bg-emerald-500/5'
          : 'border-border',
      )}
    >
      <p className="font-medium">{match.characterName}</p>
      <p>
        {match.placementLabel} · KDA {match.kdaString}
      </p>
      <p className="text-muted-foreground text-xs">{match.relativeTime}</p>
    </li>
  )
}
