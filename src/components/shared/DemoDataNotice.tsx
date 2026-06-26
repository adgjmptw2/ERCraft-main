import { Info } from 'lucide-react'

import { isRealMode } from '@/api/erClient'
import { cn } from '@/lib/utils'

export interface DemoDataNoticeProps {
  className?: string
  compact?: boolean
}

export function DemoDataNotice({ className, compact = false }: DemoDataNoticeProps) {
  if (isRealMode()) return null

  if (compact) {
    return (
      <p
        className={cn(
          'text-muted-foreground inline-flex items-center gap-1.5 text-xs leading-relaxed',
          className,
        )}
      >
        <span className="bg-muted-foreground/50 size-1 shrink-0 rounded-full" aria-hidden />
        데모 데이터 · API 연동 전 미리보기
      </p>
    )
  }

  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5 shadow-sm',
        className,
      )}
      role="note"
    >
      <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-muted-foreground text-xs leading-relaxed">
        API 연동 전 데모 데이터로 플레이 리포트 흐름을 미리볼 수 있어요.
      </p>
    </div>
  )
}
