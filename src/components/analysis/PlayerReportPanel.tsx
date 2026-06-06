import { GradeBadge } from '@/components/analysis/GradeBadge'
import { MetricComparisonCard } from '@/components/analysis/MetricComparisonCard'
import { EmptyState, SectionHeader, SurfaceCard } from '@/components/shared'
import type { PlayerAnalysisReport } from '@/analysis/types'

export interface PlayerReportPanelProps {
  report: PlayerAnalysisReport
}

export function PlayerReportPanel({ report }: PlayerReportPanelProps) {
  if (report.status === 'insufficient') {
    return (
      <section className="space-y-4 text-sm" aria-labelledby="play-report-heading">
        <SectionHeader
          id="play-report-heading"
          title="플레이 리포트"
          description="최근 데모 매치 기준으로 플레이 흐름을 요약합니다."
        />
        <EmptyState title="분석할 최근 매치가 부족합니다" description={report.summary} />
        <p className="text-muted-foreground text-xs">
          {report.baselineLabel} · 샘플 {report.sampleSize}명 · 룰 기반 분석
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-5 text-sm" aria-labelledby="play-report-heading">
      <SectionHeader
        id="play-report-heading"
        title="플레이 리포트"
        description="최근 데모 매치 기준으로 플레이 흐름을 요약합니다."
      />

      <SurfaceCard variant="muted" padding="lg" className="ring-primary/10 ring-1">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              종합 등급
            </p>
            {report.overallGrade ? (
              <GradeBadge grade={report.overallGrade} className="text-base" />
            ) : (
              <p className="text-sm font-medium">분석 데이터 부족</p>
            )}
          </div>
          {report.overallPercentile != null ? (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">샘플 대비 종합 백분위</p>
              <p className="text-lg font-semibold">{report.overallPercentile.toFixed(0)}%</p>
            </div>
          ) : null}
        </div>
        <p className="text-foreground mt-4 leading-relaxed">{report.summary}</p>
        <p className="text-muted-foreground mt-3 text-xs">
          {report.baselineLabel} · 샘플 {report.sampleSize}명 · 최근 {report.playerMatchCount}
          경기 · 룰 기반 분석
        </p>
      </SurfaceCard>

      <div className="grid gap-3 sm:grid-cols-2">
        {report.metrics.map((metric) => (
          <MetricComparisonCard
            key={metric.key}
            metric={metric}
            baselineLabel={report.baselineLabel}
          />
        ))}
      </div>

      {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {report.strengths.length > 0 ? (
            <SurfaceCard padding="md" className="space-y-2">
              <h3 className="text-foreground text-sm font-semibold">강점</h3>
              <ul className="text-muted-foreground space-y-1.5 text-sm leading-relaxed">
                {report.strengths.map((item, i) => (
                  <li key={`s-${i}`} className="break-words pl-3 before:-ml-3 before:content-['·_']">
                    {item.message}
                  </li>
                ))}
              </ul>
            </SurfaceCard>
          ) : null}

          {report.weaknesses.length > 0 ? (
            <SurfaceCard padding="md" className="space-y-2">
              <h3 className="text-foreground text-sm font-semibold">개선 포인트</h3>
              <ul className="text-muted-foreground space-y-1.5 text-sm leading-relaxed">
                {report.weaknesses.map((item, i) => (
                  <li key={`w-${i}`} className="break-words pl-3 before:-ml-3 before:content-['·_']">
                    {item.message}
                  </li>
                ))}
              </ul>
            </SurfaceCard>
          ) : null}
        </div>
      )}
    </section>
  )
}
