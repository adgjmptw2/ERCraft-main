import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface SurfaceCardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'muted' | 'inset'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantClass: Record<NonNullable<SurfaceCardProps['variant']>, string> = {
  default: 'border-border bg-card shadow-sm',
  muted: 'border-border/80 bg-muted/25 shadow-sm',
  inset: 'border-border/70 bg-background/60 shadow-none',
}

const paddingClass: Record<NonNullable<SurfaceCardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5 sm:p-6',
}

export function SurfaceCard({
  children,
  className,
  variant = 'default',
  padding = 'md',
}: SurfaceCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border transition-colors',
        variantClass[variant],
        paddingClass[padding],
        className,
      )}
    >
      {children}
    </div>
  )
}
