import { cn } from '@/lib/utils'
import type { AnalysisGrade } from '@/analysis/types'

const GRADE_LABEL: Record<AnalysisGrade, string> = {
  S: 'S등급',
  A: 'A등급',
  B: 'B등급',
  C: 'C등급',
  D: 'D등급',
}

const GRADE_CLASS: Record<AnalysisGrade, string> = {
  S: 'border-violet-500/50 bg-violet-500/15 text-violet-900 dark:text-violet-100',
  A: 'border-sky-500/50 bg-sky-500/15 text-sky-900 dark:text-sky-100',
  B: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100',
  C: 'border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100',
  D: 'border-border bg-muted text-muted-foreground',
}

export interface GradeBadgeProps {
  grade: AnalysisGrade | null
  className?: string
}

export function GradeBadge({ grade, className }: GradeBadgeProps) {
  if (!grade) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium',
          className,
        )}
      >
        데이터 없음
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-semibold',
        GRADE_CLASS[grade],
        className,
      )}
    >
      {GRADE_LABEL[grade]}
    </span>
  )
}
