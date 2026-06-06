import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface SectionHeaderProps {
  id?: string
  title: string
  description?: string
  badge?: ReactNode
  className?: string
}

export function SectionHeader({ id, title, description, badge, className }: SectionHeaderProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id={id}
          className="text-foreground text-base font-semibold tracking-tight sm:text-lg"
        >
          {title}
        </h2>
        {badge}
      </div>
      {description ? (
        <p className="text-muted-foreground max-w-prose text-xs leading-relaxed sm:text-sm">
          {description}
        </p>
      ) : null}
    </div>
  )
}
