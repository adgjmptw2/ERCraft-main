import { cn } from '@/lib/utils'
import type { MatchCelebrationLevel, MatchHighlightResult } from '@/utils/matchHighlight'

export function MatchSparkleChip({ highlight }: { highlight: MatchHighlightResult }) {
  if (highlight.level !== 'mvp') return null

  return (
    <span
      className={cn('match-card__sparkle-chip', 'match-card__sparkle-chip--sparkle')}
      title={highlight.description}
      aria-label={highlight.description}
    >
      {highlight.label}
    </span>
  )
}

export function MatchVictorySparkleParticles({ level }: { level: MatchCelebrationLevel }) {
  if (level !== 'mvp') return null

  return (
    <>
      <span className="match-card__sparkle-particle" aria-hidden="true" />
      <span className="match-card__sparkle-particle" aria-hidden="true" />
      <span className="match-card__sparkle-particle" aria-hidden="true" />
      <span className="match-card__sparkle-particle" aria-hidden="true" />
    </>
  )
}
