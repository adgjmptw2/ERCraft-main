import type { AnalysisMetricCardModel } from '@/analysis/analysisTabViewModel'
import { AnalysisMetricCard } from '@/components/analysis/tab/AnalysisMetricCard'
import { SectionHeader } from '@/components/shared'
import { cn } from '@/lib/utils'

export interface AnalysisMetricGridProps {
  cards: AnalysisMetricCardModel[]
  className?: string
}

export function AnalysisMetricGrid({ cards, className }: AnalysisMetricGridProps) {
  // overallScore는 레이더 패널 히어로 카드에 이미 표시됨 — 그리드 중복 제거
  const gridCards = cards.filter((c) => c.id !== 'overallScore')
  if (gridCards.length === 0) return null

  return (
    <section className={cn('space-y-4', className)} aria-labelledby="analysis-metrics-heading">
      <SectionHeader
        id="analysis-metrics-heading"
        title="상세 지표"
        description="Eternal Return 전용 랭크 지표 · 데모 매치 기준"
        size="default"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {gridCards.map((card) => (
          <div
            key={card.id}
            className={cn(
              card.size === 'medium' && 'min-h-[7.5rem]',
            )}
          >
            <AnalysisMetricCard card={card} />
          </div>
        ))}
      </div>
    </section>
  )
}
