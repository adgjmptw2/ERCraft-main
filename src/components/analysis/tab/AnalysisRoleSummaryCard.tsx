import { SurfaceCard } from '@/components/shared'
import { cn } from '@/lib/utils'

export interface AnalysisRoleSummaryCardProps {
  primaryRole: string | null
  secondaryRole: string | null
  confidence: 'low' | 'medium' | 'high' | null
  reason: string | null
  basisLabel: string
  showBasisLabel?: boolean
  className?: string
}

const CONFIDENCE_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
}

export function AnalysisRoleSummaryCard({
  primaryRole,
  secondaryRole,
  confidence,
  reason,
  basisLabel,
  showBasisLabel = true,
  className,
}: AnalysisRoleSummaryCardProps) {
  const confidenceLabel = primaryRole && confidence ? CONFIDENCE_LABEL[confidence] : null
  const reasonText =
    !primaryRole && (!reason || reason === '분석 보류')
      ? '최근 경기 기준으로는 역할군을 단정하기 어려워 분석을 보류합니다.'
      : (reason ?? '최근 경기 지표를 바탕으로 추정한 플레이 경향입니다.')

  return (
    <SurfaceCard variant="accent" padding="md" className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            추정 역할군
          </p>
          <p className="text-foreground text-2xl font-bold tracking-tight">
            {primaryRole ?? '분석 보류'}
          </p>
        </div>
        {confidenceLabel ? (
          <span className="border-border/60 bg-background/50 text-muted-foreground rounded-md border px-2 py-1 text-[10px] font-medium">
            신뢰도 {confidenceLabel}
          </span>
        ) : null}
      </div>

      {secondaryRole ? (
        <p className="text-muted-foreground text-xs">
          보조 경향 <span className="text-foreground font-semibold">{secondaryRole}</span>
        </p>
      ) : null}

      <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
        {reasonText}
      </p>
      {showBasisLabel ? (
        <p className="text-primary/80 text-[10px] font-medium">{basisLabel} 플레이 경향</p>
      ) : null}
    </SurfaceCard>
  )
}
