import { cn } from '@/lib/utils'

export interface AnalysisBasisNoteProps {
  label: string
  className?: string
}

export function AnalysisBasisNote({ label, className }: AnalysisBasisNoteProps) {
  return <p className={cn('text-muted-foreground text-xs', className)}>{label}</p>
}
