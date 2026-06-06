import type { ReactNode } from 'react'

import { SurfaceCard } from '@/components/shared/SurfaceCard'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <SurfaceCard
      variant="inset"
      padding="lg"
      className={cn('border-dashed', className)}
    >
      <div className="flex flex-col items-start gap-2 text-left">
        <p className="text-foreground text-sm font-medium break-words">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-sm leading-relaxed break-words">{description}</p>
        ) : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </SurfaceCard>
  )
}
