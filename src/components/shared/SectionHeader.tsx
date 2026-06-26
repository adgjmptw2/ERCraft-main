import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface SectionHeaderProps {
  id?: string
  title: string
  description?: string
  badge?: ReactNode
  className?: string
  size?: 'default' | 'lg'
}

export function SectionHeader({
  id,
  title,
  description,
  badge,
  className,
  size = 'default',
}: SectionHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2
          id={id}
          className={cn(
            'text-foreground border-primary/70 border-l-2 pl-3 font-semibold tracking-tight',
            size === 'lg' ? 'text-lg sm:text-xl' : 'text-base sm:text-lg',
          )}
        >
          {title}
        </h2>
        {badge}
      </div>
      {description ? (
        <p className="text-muted-foreground max-w-3xl pl-3.5 text-sm leading-relaxed">{description}</p>
      ) : null}
    </div>
  )
}
