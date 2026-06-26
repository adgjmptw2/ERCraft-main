import { EmptyState, SurfaceCard } from '@/components/shared'

export interface AnalysisEmptyStateProps {
  title?: string
  description?: string
}

export function AnalysisEmptyState({
  title = '분석 데이터 부족',
  description = '최근 랭크 매치 표본이 부족해 성향 분석을 표시할 수 없습니다.',
}: AnalysisEmptyStateProps) {
  return (
    <SurfaceCard variant="inset" padding="lg">
      <EmptyState title={title} description={description} />
    </SurfaceCard>
  )
}
