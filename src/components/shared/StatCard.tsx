import type { ReactNode } from 'react'

import { SurfaceCard } from '@/components/shared/SurfaceCard'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: ReactNode
  description?: string
  highlight?: boolean
  className?: string
}

export function StatCard({ label, value, description, highlight = false, className }: StatCardProps) {
  const display =
    value === null || value === undefined || value === '' ? (
      <span className="text-muted-foreground">-</span>
    ) : (
      value
    )

  return (
    <SurfaceCard
      padding="md"
      variant={highlight ? 'muted' : 'default'}
      className={cn(highlight && 'ring-primary/10 ring-1', className)}
    >
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 break-words font-semibold',
          highlight ? 'text-xl sm:text-2xl' : 'text-lg',
        )}
      >
        {display}
      </p>
      {description ? (
        <p className="text-muted-foreground mt-1.5 text-xs break-words">{description}</p>
      ) : null}
    </SurfaceCard>
  )
}
