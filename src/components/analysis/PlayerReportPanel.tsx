import { GradeBadge } from '@/components/analysis/GradeBadge'
import { MetricComparisonCard } from '@/components/analysis/MetricComparisonCard'
import { EmptyState, SectionHeader, SurfaceCard } from '@/components/shared'
import type { PlayerAnalysisReport } from '@/analysis/types'

export interface PlayerReportPanelProps {
  report: PlayerAnalysisReport
}

function formatSigned(value: number | null | undefined): string {
  if (value == null) return '데이터 부족'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

function formatScore(value: number | null | undefined): string {
  return value == null ? '데이터 부족' : value.toFixed(1)
}

export function PlayerReportPanel({ report }: PlayerReportPanelProps) {
  const overallPerformanceScore = report.overallPerformanceScore
  const isPerformanceScore =
    report.overallScoreSource === 'character-grade-weighted-average' ||
    report.overallScoreSource === 'character-grade-weighted-average-fallback' ||
    report.overallScoreSource === 'overall-v2-hybrid' ||
    report.overallScoreSource === 'overall-aggregate-grade-v2' ||
    report.overallScoreSource === 'overall-aggregate-grade-v3' ||
    report.overallScoreSource === 'overall-aggregate-grade-v4'
  const description = isPerformanceScore
    ? '현재 시즌 캐릭터 성과 가중 평균으로 플레이 흐름을 요약합니다.'
    : '최근 데모 매치 기준으로 플레이 흐름을 요약합니다.'

  if (report.status === 'insufficient') {
    return (
      <section className="space-y-4 text-sm" aria-labelledby="play-report-heading">
        <SectionHeader
          id="play-report-heading"
          title="플레이 리포트"
          description={description}
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
        description={description}
      />

      <SurfaceCard variant="elevated" padding="lg" className="ring-primary/10 ring-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              종합 등급
            </p>
            {report.overallGrade ? (
              <GradeBadge grade={report.overallGrade} className="text-lg" />
            ) : (
              <p className="text-base font-medium">분석 데이터 부족</p>
            )}
          </div>
          {isPerformanceScore && overallPerformanceScore != null ? (
            <div className="sm:text-right">
              <p className="text-muted-foreground text-xs">종합 성과 점수</p>
              <p className="text-2xl font-bold tracking-tight">
                {overallPerformanceScore.toFixed(0)}
              </p>
            </div>
          ) : report.overallPercentile != null ? (
            <div className="sm:text-right">
              <p className="text-muted-foreground text-xs">샘플 대비 종합 백분위</p>
              <p className="text-2xl font-bold tracking-tight">
                {report.overallPercentile.toFixed(0)}%
              </p>
            </div>
          ) : null}
        </div>
        <p className="text-foreground mt-4 text-base leading-relaxed">{report.summary}</p>
        {report.overallScoreSource === 'overall-v2-hybrid' &&
        report.basePerformanceScore != null &&
        overallPerformanceScore != null ? (
          <dl className="border-border/60 mt-4 grid gap-2 border-t pt-3 text-xs tabular-nums sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">기본 캐릭터 성과</dt>
              <dd>{report.basePerformanceScore.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">결과 성과 보정</dt>
              <dd>{(report.outcomeModifier ?? 0).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">일관성 보정</dt>
              <dd>{(report.consistencyModifier ?? 0).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold">
              <dt>최종 종합 점수</dt>
              <dd>{overallPerformanceScore.toFixed(2)}</dd>
            </div>
          </dl>
        ) : null}
        <p className="text-muted-foreground mt-3 text-xs">
          {report.baselineLabel} · 샘플 {report.sampleSize}명 · 최근 {report.playerMatchCount}
          경기 · 룰 기반 분석
        </p>
      </SurfaceCard>

      {report.teamPerformanceSummary ? (
        <SurfaceCard variant="muted" padding="md" className="space-y-3">
          <div>
            <h3 className="text-foreground text-sm font-semibold">최근 팀운</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              최근 랭크 경기에서 팀원들이 보인 실제 성과와 내 성과와의 차이를 분석한 지표입니다.
            </p>
          </div>
          <dl className="grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">평균 팀운</dt>
              <dd className="text-foreground mt-1 text-base font-semibold tabular-nums">
                {formatScore(report.teamPerformanceSummary.averageTeammatePerformanceScore)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">평균 캐리 부담</dt>
              <dd className="text-foreground mt-1 text-base font-semibold tabular-nums">
                {formatSigned(report.teamPerformanceSummary.averageCarryBurdenDelta)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">분석 경기 수</dt>
              <dd className="text-foreground mt-1 text-base font-semibold tabular-nums">
                {report.teamPerformanceSummary.sampleSize}
              </dd>
            </div>
          </dl>
        </SurfaceCard>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {report.metrics.map((metric) => (
          <MetricComparisonCard
            key={metric.key}
            metric={metric}
            baselineLabel={report.baselineLabel}
          />
        ))}
      </div>

      {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {report.strengths.length > 0 ? (
            <SurfaceCard variant="muted" padding="md" className="space-y-2.5">
              <h3 className="text-foreground text-sm font-semibold">강점</h3>
              <ul className="text-muted-foreground space-y-2 text-sm leading-relaxed">
                {report.strengths.map((item, i) => (
                  <li key={`s-${i}`} className="break-words pl-3 before:-ml-3 before:content-['·_']">
                    {item.message}
                  </li>
                ))}
              </ul>
            </SurfaceCard>
          ) : null}

          {report.weaknesses.length > 0 ? (
            <SurfaceCard variant="muted" padding="md" className="space-y-2.5">
              <h3 className="text-foreground text-sm font-semibold">개선 포인트</h3>
              <ul className="text-muted-foreground space-y-2 text-sm leading-relaxed">
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
