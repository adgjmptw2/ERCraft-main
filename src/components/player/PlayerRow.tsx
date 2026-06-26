import { Link } from 'react-router-dom'

import { TierBadge } from '@/components/shared/TierBadge'
import type { PlayerSummary } from '@/types/player'
import { buildPlayerProfilePath } from '@/utils/profilePath'

export interface PlayerRowProps {
  player: PlayerSummary
}

export function PlayerRow({ player }: PlayerRowProps) {
  return (
    <li className="hover:bg-muted/30 flex flex-col gap-2 px-4 py-3.5 text-sm transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-foreground truncate text-base font-semibold">{player.nickname}</span>
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={player.tier} />
          <span className="text-muted-foreground text-xs">Lv.{player.level ?? '-'}</span>
        </div>
      </div>
      <Link
        className="text-primary inline-flex min-h-9 shrink-0 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-right"
        to={buildPlayerProfilePath(player.nickname)}
      >
        프로필 보기
      </Link>
    </li>
  )
}
