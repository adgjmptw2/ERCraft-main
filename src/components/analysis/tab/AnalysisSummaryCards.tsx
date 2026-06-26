import type { AnalysisMetricCardModel } from '@/analysis/analysisTabViewModel'
import { AnalysisMetricCard } from '@/components/analysis/tab/AnalysisMetricCard'
import { SectionHeader } from '@/components/shared'
import { cn } from '@/lib/utils'

export interface AnalysisSummaryCardsProps {
  cards: AnalysisMetricCardModel[]
  basisLabel?: string
  compact?: boolean
  className?: string
}

/** compact 모드(사이드 패널)에서 노출할 최대 카드 수 — 하단 상세 지표와 중복 최소화 */
const COMPACT_CARD_LIMIT = 5

export function AnalysisSummaryCards({
  cards,
  basisLabel,
  compact = false,
  className,
}: AnalysisSummaryCardsProps) {
  if (cards.length === 0) return null

  const displayCards = compact ? cards.slice(0, COMPACT_CARD_LIMIT) : cards

  return (
    <section className={cn('space-y-3', className)} aria-labelledby="analysis-summary-heading">
      {compact ? (
        <div className="space-y-0.5">
          <h3 id="analysis-summary-heading" className="text-foreground text-sm font-semibold">
            핵심 요약
          </h3>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {basisLabel ? `${basisLabel} 주요 지표` : '계산 가능한 주요 지표'}
          </p>
        </div>
      ) : (
        <SectionHeader
          id="analysis-summary-heading"
          title="핵심 요약"
          description={basisLabel ? `${basisLabel} 주요 지표` : '최근 경기 핵심 지표'}
          size="default"
        />
      )}
      <div className={cn('grid grid-cols-2 gap-3', compact ? 'sm:grid-cols-2' : 'md:grid-cols-3 xl:grid-cols-6')}>
        {displayCards.map((card) => (
          <AnalysisMetricCard key={card.id} card={card} variant={compact ? 'secondary' : 'summary'} />
        ))}
      </div>
    </section>
  )
}
