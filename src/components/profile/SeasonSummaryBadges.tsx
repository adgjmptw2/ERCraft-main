import type { SeasonRank } from '@/types/rank'
import { formatTierBadge, tierAccentColor } from '@/utils/rankTier'

export interface SeasonSummaryBadgesProps {
  seasonNumber: number
  rank: SeasonRank
  tierDetail: string
}

export function SeasonSummaryBadges({
  seasonNumber,
  rank,
  tierDetail,
}: SeasonSummaryBadgesProps) {
  const accent = tierAccentColor(rank.tier)
  const tierLabel = formatTierBadge(rank)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="bg-muted text-foreground inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md px-2 text-xs font-bold tabular-nums">
          S{seasonNumber}
        </span>
        <span
          className="tier-badge-fill inline-flex h-7 items-center rounded-md px-2 text-xs font-bold"
          style={{ ['--tier-accent' as string]: accent }}
        >
          {tierLabel}
        </span>
      </div>
      <p className="text-muted-foreground text-xs tabular-nums">{tierDetail}</p>
    </div>
  )
}
