import { cn } from '@/lib/utils'
import type { MatchSummaryDTO } from '@/types/match'
import { SurfaceCard } from '@/components/shared/SurfaceCard'

export interface MatchRowProps {
  match: MatchSummaryDTO
}

export function MatchRow({ match }: MatchRowProps) {
  return (
    <li>
      <SurfaceCard
        padding="sm"
        variant={match.victory ? 'muted' : 'default'}
        className={cn(
          match.victory && 'border-l-4 border-l-emerald-500/80',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-foreground min-w-0 flex-1 font-medium break-all">
            {match.characterName}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium',
              match.victory
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {match.victory ? '승리' : '패배'}
          </span>
        </div>
        <p className="mt-1.5 text-sm break-words">
          {match.placementLabel} · KDA {match.kdaString}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{match.relativeTime}</p>
      </SurfaceCard>
    </li>
  )
}
