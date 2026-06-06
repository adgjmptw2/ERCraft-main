import { GradeBadge } from '@/components/analysis/GradeBadge'
import { MetricComparisonCard } from '@/components/analysis/MetricComparisonCard'
import { EmptyState } from '@/components/shared'
import type { PlayerAnalysisReport } from '@/analysis/types'

export interface PlayerReportPanelProps {
  report: PlayerAnalysisReport
}

export function PlayerReportPanel({ report }: PlayerReportPanelProps) {
  if (report.status === 'insufficient') {
    return (
      <section className="space-y-3 text-sm" aria-labelledby="play-report-heading">
        <h2 id="play-report-heading" className="text-foreground font-medium">
          플레이 리포트
        </h2>
        <EmptyState
          title="분석할 최근 매치가 부족합니다"
          description={report.summary}
        />
        <p className="text-muted-foreground text-xs">
          {report.baselineLabel} · 샘플 플레이어 {report.sampleSize}명 기준 · 룰 기반 분석
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4 text-sm" aria-labelledby="play-report-heading">
      <div className="space-y-1">
        <h2 id="play-report-heading" className="text-foreground font-medium">
          플레이 리포트
        </h2>
        <p className="text-muted-foreground text-xs">
          {report.baselineLabel} · 샘플 {report.sampleSize}명 · 최근 {report.playerMatchCount}
          경기 · 룰 기반 분석
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">종합 등급</p>
          {report.overallGrade ? (
            <GradeBadge grade={report.overallGrade} />
          ) : (
            <p className="text-sm">분석 데이터 부족</p>
          )}
        </div>
        {report.overallPercentile != null ? (
          <p className="text-muted-foreground text-xs">
            샘플 대비 종합 백분위 {report.overallPercentile.toFixed(0)}%
          </p>
        ) : null}
      </div>

      <p className="text-foreground leading-relaxed">{report.summary}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {report.metrics.map((metric) => (
          <MetricComparisonCard
            key={metric.key}
            metric={metric}
            baselineLabel={report.baselineLabel}
          />
        ))}
      </div>

      {report.strengths.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-foreground text-sm font-medium">강점</h3>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            {report.strengths.map((item, i) => (
              <li key={`s-${i}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.weaknesses.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-foreground text-sm font-medium">개선 포인트</h3>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            {report.weaknesses.map((item, i) => (
              <li key={`w-${i}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
        API 연동 전 미리보기입니다. 비교 기준은 mock 샘플 데이터이며 공식 통계가 아닙니다.
      </p>
    </section>
  )
}
