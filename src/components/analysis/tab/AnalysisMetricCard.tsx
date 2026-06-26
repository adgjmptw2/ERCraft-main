import type { AnalysisMetricCardModel } from '@/analysis/analysisTabViewModel'
import { AnalysisMetricStatusBadge } from '@/components/analysis/tab/AnalysisMetricStatusBadge'
import { SurfaceCard } from '@/components/shared'
import { cn } from '@/lib/utils'

export type AnalysisMetricCardVariant = 'default' | 'summary' | 'secondary' | 'future'

export interface AnalysisMetricCardProps {
  card: AnalysisMetricCardModel
  variant?: AnalysisMetricCardVariant
}

const valueSize: Record<AnalysisMetricCardVariant, string> = {
  default: 'text-xl sm:text-2xl',
  summary: 'text-2xl sm:text-3xl',
  secondary: 'text-lg sm:text-xl',
  future: 'text-sm sm:text-base',
}

/** hint 문자열("스증 딜러 기준 · 상위권 · 49명")에서 백분위 레벨 추출 */
function resolvePercentileLevel(hint: string | undefined): 'top' | 'mid' | 'bottom' | 'insufficient' | null {
  if (!hint) return null
  if (hint.includes('상위권')) return 'top'
  if (hint.includes('하위권')) return 'bottom'
  if (hint.includes('중위권')) return 'mid'
  if (hint.includes('표본 부족')) return 'insufficient'
  return null
}

const levelValueClass: Record<'top' | 'mid' | 'bottom' | 'insufficient', string> = {
  top: 'text-foreground',
  mid: 'text-yellow-400 dark:text-yellow-300',
  bottom: 'text-orange-400 dark:text-orange-300',
  insufficient: 'text-muted-foreground',
}

const levelBorderClass: Record<'top' | 'mid' | 'bottom' | 'insufficient', string> = {
  top: '',
  mid: 'border-yellow-500/25',
  bottom: 'border-orange-500/25',
  insufficient: '',
}

const levelBadge: Record<'top' | 'mid' | 'bottom' | 'insufficient', { label: string; className: string }> = {
  top: { label: '상위권', className: 'bg-primary/10 text-primary border-primary/20' },
  mid: { label: '중위권', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-300 border-yellow-500/25' },
  bottom: { label: '하위권', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/25' },
  insufficient: { label: '표본 부족', className: 'bg-muted text-muted-foreground border-border' },
}

export function AnalysisMetricCard({ card, variant = 'default' }: AnalysisMetricCardProps) {
  const isFuture = card.status === 'future'
  const isMuted = card.status !== 'ready' && !isFuture
  const level = !isMuted && !isFuture ? resolvePercentileLevel(card.hint) : null
  const badge = level ? levelBadge[level] : null

  return (
    <SurfaceCard
      variant={variant === 'summary' ? 'accent' : 'default'}
      padding="none"
      className={cn(
        'flex h-full flex-col justify-between gap-2 p-3 sm:p-4',
        'hover:border-border/80 transition-[border-color,box-shadow]',
        variant === 'future' && 'border-dashed bg-muted/15',
        variant === 'secondary' && 'bg-muted/10',
        isMuted && 'opacity-90',
        level && levelBorderClass[level],
      )}
    >
      <div className="space-y-1.5">
        <p
          className={cn(
            'font-bold tabular-nums tracking-tight',
            valueSize[variant],
            isFuture && 'text-muted-foreground font-semibold',
            isMuted && !isFuture && 'text-muted-foreground',
            !isMuted && !isFuture && level ? levelValueClass[level] : !isMuted && !isFuture ? 'text-foreground' : '',
          )}
        >
          {card.value}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-foreground text-xs font-semibold">{card.label}</p>
          {card.status !== 'ready' ? (
            <AnalysisMetricStatusBadge status={card.status} className="shrink-0" />
          ) : badge ? (
            <span
              className={cn(
                'shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none',
                badge.className,
              )}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        {card.hint ? (
          <p className="text-muted-foreground line-clamp-2 text-[10px] leading-snug">{card.hint}</p>
        ) : null}
      </div>
    </SurfaceCard>
  )
}
