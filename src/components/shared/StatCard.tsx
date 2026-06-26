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
      variant={highlight ? 'elevated' : 'default'}
      className={cn(highlight && 'ring-primary/15 ring-1', className)}
    >
      <p className="text-muted-foreground text-[0.65rem] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 break-words font-bold tracking-tight',
          highlight ? 'text-2xl font-extrabold sm:text-3xl' : 'text-xl font-bold',
        )}
      >
        {display}
      </p>
      {description ? (
        <p className="text-muted-foreground mt-2 text-xs break-words">{description}</p>
      ) : null}
    </SurfaceCard>
  )
}
