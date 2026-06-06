import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: ReactNode
  description?: string
  className?: string
}

export function StatCard({ label, value, description, className }: StatCardProps) {
  const display =
    value === null || value === undefined || value === '' ? (
      <span className="text-muted-foreground">-</span>
    ) : (
      value
    )

  return (
    <div className={cn('rounded-md border border-border bg-card p-3', className)}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-lg font-semibold break-words">{display}</p>
      {description ? (
        <p className="text-muted-foreground mt-1 text-xs break-words">{description}</p>
      ) : null}
    </div>
  )
}
