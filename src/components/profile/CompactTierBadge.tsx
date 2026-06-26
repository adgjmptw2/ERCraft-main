import { tierAccentColor } from '@/utils/rankTier'
import { cn } from '@/lib/utils'

export interface CompactTierBadgeProps {
  tier: string
  className?: string
}

export function CompactTierBadge({ tier, className }: CompactTierBadgeProps) {
  const short = tier.trim() || '—'
  const accent = tierAccentColor(short)

  return (
    <span
      className={cn(
        'inline-flex max-w-[5.5rem] shrink-0 items-center truncate rounded px-1.5 py-0.5 text-[10px] font-semibold',
        className,
      )}
      style={{
        color: accent,
        borderColor: `${accent}55`,
        backgroundColor: `${accent}18`,
        borderWidth: 1,
        borderStyle: 'solid',
      }}
      title={tier}
    >
      {short}
    </span>
  )
}
