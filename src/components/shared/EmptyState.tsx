import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-5 text-left',
        className,
      )}
    >
      <p className="text-foreground text-sm font-medium break-words">{title}</p>
      {description ? (
        <p className="text-muted-foreground text-sm leading-relaxed break-words">{description}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
