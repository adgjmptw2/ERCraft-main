import type { DemoSeasonRecord } from '@/mocks/seasonHistory'
import { isSeasonChipSelectable } from '@/utils/profileSeasonPolicy'
import { tierBadgeUrl } from '@/utils/assetUrls'
import { formatTierBadgeCompact, tierAccentColor } from '@/utils/rankTier'
import { cn } from '@/lib/utils'

export interface SeasonHistoryGridProps {
  seasons: DemoSeasonRecord[]
  selectedSeason: number
  currentSeason: number
  /** real 모드 — S1~(current-1) 클릭 불가 */
  disablePastSeasonSelection?: boolean
  onSelect: (seasonNumber: number) => void
  className?: string
}

function seasonChipClassName(isActive: boolean): string {
  return cn(
    'inline-flex h-7 w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-0.5 text-[9px] font-semibold transition-colors sm:h-8 sm:w-auto sm:shrink-0 sm:gap-1.5 sm:px-2 sm:text-xs',
    isActive
      ? 'bg-primary/15 ring-primary/30 ring-1'
      : 'border-border/70 bg-card/40',
  )
}

function SeasonChipContent({
  seasonNumber,
  isActive,
  tierImageUrl,
}: {
  seasonNumber: number
  isActive: boolean
  tierImageUrl: string | null
}) {
  return (
    <>
      <span
        className={cn(
          'leading-none font-bold tabular-nums',
          isActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        S{seasonNumber}
      </span>
      {tierImageUrl ? (
        <img
          src={tierImageUrl}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          className="size-3 shrink-0 object-contain sm:size-4"
        />
      ) : null}
    </>
  )
}

export function SeasonHistoryGrid({
  seasons,
  selectedSeason,
  currentSeason,
  disablePastSeasonSelection = false,
  onSelect,
  className,
}: SeasonHistoryGridProps) {
  if (seasons.length === 0) return null
  const sortedSeasons = [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)

  return (
    <div className={cn('min-w-0', className)}>
      <div className="grid grid-cols-6 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 lg:flex-nowrap lg:overflow-x-auto">
        {sortedSeasons.map((season) => {
          const isActive = season.seasonNumber === selectedSeason
          const selectable = isSeasonChipSelectable(
            season.seasonNumber,
            currentSeason,
            disablePastSeasonSelection,
          )
          const accent = tierAccentColor(season.rank.tier)
          const tierLabel = formatTierBadgeCompact(season.rank)
          const tierImageUrl = tierBadgeUrl(tierLabel)
          const chipStyle = isActive ? { borderColor: accent } : { borderColor: `${accent}55` }

          if (!selectable) {
            return (
              <div
                key={season.seasonNumber}
                aria-label={`S${season.seasonNumber} ${tierLabel}`}
                className={seasonChipClassName(isActive)}
                style={chipStyle}
              >
                <SeasonChipContent
                  seasonNumber={season.seasonNumber}
                  isActive={isActive}
                  tierImageUrl={tierImageUrl}
                />
              </div>
            )
          }

          return (
            <button
              key={season.seasonNumber}
              type="button"
              onClick={() => onSelect(season.seasonNumber)}
              aria-pressed={isActive}
              aria-label={`S${season.seasonNumber} ${tierLabel}`}
              className={cn(
                seasonChipClassName(isActive),
                'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
              )}
              style={chipStyle}
            >
              <SeasonChipContent
                seasonNumber={season.seasonNumber}
                isActive={isActive}
                tierImageUrl={tierImageUrl}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
