import { Link } from 'react-router-dom'

import { TierBadge } from '@/components/shared/TierBadge'
import type { PlayerSummary } from '@/types/player'

export interface PlayerRowProps {
  player: PlayerSummary
}

export function PlayerRow({ player }: PlayerRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-medium">{player.nickname}</span>
        <TierBadge tier={player.tier} />
      </div>
      <Link
        className="text-primary shrink-0 font-medium underline-offset-4 hover:underline"
        to={`/player/${encodeURIComponent(player.nickname)}`}
      >
        프로필 보기
      </Link>
    </li>
  )
}
