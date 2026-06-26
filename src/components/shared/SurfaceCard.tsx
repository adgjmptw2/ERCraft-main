import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface SurfaceCardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'muted' | 'inset' | 'elevated' | 'accent'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
}

const variantClass: Record<NonNullable<SurfaceCardProps['variant']>, string> = {
  default: 'border-border bg-card shadow-[var(--card-shadow)] dark:shadow-sm',
  muted: 'border-border bg-muted/30 shadow-[var(--card-shadow)] dark:shadow-sm',
  inset: 'border-border/60 bg-background/50 shadow-none',
  elevated: 'border-border bg-card shadow-[var(--card-shadow)] dark:shadow-md',
  accent:
    'border-primary/15 bg-gradient-to-br from-card via-card to-muted/40 shadow-[var(--card-shadow)] dark:shadow-sm dark:to-muted/20',
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
  interactive = false,
}: SurfaceCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border transition-[box-shadow,border-color,background-color]',
        variantClass[variant],
        paddingClass[padding],
        interactive && 'hover:border-border hover:shadow-md',
        className,
      )}
    >
      {children}
    </div>
  )
}
