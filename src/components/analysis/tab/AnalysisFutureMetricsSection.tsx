import type { AnalysisMetricCardModel } from '@/analysis/analysisTabViewModel'
import type { AnalysisMetricViewModel } from '@/analysis/metricTypes'
import { SurfaceCard } from '@/components/shared'
import { cn } from '@/lib/utils'

export interface AnalysisFutureMetricsSectionProps {
  teamPreviewMetrics: AnalysisMetricCardModel[]
  futureMetrics: AnalysisMetricViewModel[]
  className?: string
}

export function AnalysisFutureMetricsSection({
  futureMetrics,
  className,
}: AnalysisFutureMetricsSectionProps) {
  const datasetCount = futureMetrics.filter((m) => m.availability === 'requiresDataset').length
  const matchDetailCount = futureMetrics.filter(
    (m) => m.availability === 'requiresMatchDetail',
  ).length

  if (futureMetrics.length === 0) return null

  return (
    <aside className={cn('space-y-2', className)} aria-labelledby="analysis-future-heading">
      <h2 id="analysis-future-heading" className="text-muted-foreground text-xs font-medium">
        확장 예정 지표
      </h2>
      <SurfaceCard variant="inset" padding="md" className="space-y-2">
        {matchDetailCount > 0 ? (
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            상세 경기 데이터 연결 후 팀운·파티 전력 비교·팀 내 기여 비율을 제공할 예정입니다.
          </p>
        ) : null}
        {datasetCount > 0 ? (
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            표본이 충분히 쌓이면 역할별 참조 비교 지표를 추가할 예정입니다.
          </p>
        ) : null}
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          현재는 최근 경기 요약 데이터 기준으로 계산됩니다.
        </p>
      </SurfaceCard>
    </aside>
  )
}
