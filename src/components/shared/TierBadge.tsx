import { cn } from '@/lib/utils'

type TierBucket = 'muted' | 'amber' | 'sky' | 'violet' | 'orange'

function firstToken(tier: string): string {
  const t = tier.trim().toLowerCase()
  if (!t) return ''
  return t.split(/\s+/)[0] ?? ''
}

function bucketForToken(token: string): TierBucket {
  if (token === 'iron' || token === 'bronze') return 'muted'
  if (token === 'silver' || token === 'gold') return 'amber'
  if (token === 'platinum' || token === 'diamond') return 'sky'
  if (token === 'meteorite' || token === 'mithril') return 'violet'
  if (token === 'demigod' || token === 'eternity') return 'orange'
  return 'muted'
}

const bucketClass: Record<TierBucket, string> = {
  muted: 'border-border bg-muted/80 text-muted-foreground',
  amber:
    'border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100',
  sky: 'border-sky-500/40 bg-sky-500/15 text-sky-950 dark:text-sky-100',
  violet:
    'border-violet-500/40 bg-violet-500/15 text-violet-950 dark:text-violet-100',
  orange:
    'border-orange-500/40 bg-orange-500/15 text-orange-950 dark:text-orange-100',
}

export interface TierBadgeProps {
  tier: string
}

export function TierBadge({ tier }: TierBadgeProps) {
  const token = firstToken(tier)
  const bucket = bucketForToken(token)

  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        bucketClass[bucket],
      )}
    >
      <span className="truncate">{tier.trim() || '—'}</span>
    </span>
  )
}
