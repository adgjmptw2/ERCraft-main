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
    <div className={cn('space-y-1', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={id} className="text-foreground text-base font-semibold tracking-tight">
          {title}
        </h2>
        {badge}
      </div>
      {description ? (
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      ) : null}
    </div>
  )
}
