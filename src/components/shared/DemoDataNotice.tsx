import { Info } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface DemoDataNoticeProps {
  className?: string
  compact?: boolean
}

export function DemoDataNotice({ className, compact = false }: DemoDataNoticeProps) {
  if (compact) {
    return (
      <p className={cn('text-muted-foreground text-xs leading-relaxed', className)}>
        API 연동 전 · 데모 데이터 미리보기
      </p>
    )
  }

  return (
    <div
      className={cn(
        'flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm',
        className,
      )}
      role="note"
    >
      <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-muted-foreground space-y-1 text-xs leading-relaxed">
        <p>현재는 API 키 발급 전이라 데모 데이터로 전적 화면을 미리 보여주고 있어요.</p>
        <p>실제 전적 연동 시 닉네임 검색과 최근 매치가 공식 API 기준으로 갱신될 예정입니다.</p>
      </div>
    </div>
  )
}
