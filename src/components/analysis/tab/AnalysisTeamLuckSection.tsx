import type { TeamLuckViewModel } from '@/analysis/analysisSummaryEnrichment'
import { SurfaceCard } from '@/components/shared'

export interface AnalysisTeamLuckSectionProps {
  teamLuck: TeamLuckViewModel
}

export function AnalysisTeamLuckSection({ teamLuck }: AnalysisTeamLuckSectionProps) {
  if (!teamLuck.hasData) {
    if (!teamLuck.emptyMessage) return null
    return (
      <section className="space-y-2" aria-labelledby="analysis-team-luck-heading">
        <h2 id="analysis-team-luck-heading" className="text-foreground text-sm font-semibold">
          팀운
        </h2>
        <SurfaceCard variant="inset" padding="md">
          <p className="text-muted-foreground text-xs leading-relaxed">{teamLuck.emptyMessage}</p>
        </SurfaceCard>
      </section>
    )
  }

  return (
    <section className="space-y-2" aria-labelledby="analysis-team-luck-heading">
      <h2 id="analysis-team-luck-heading" className="text-foreground text-sm font-semibold">
        팀운
      </h2>
      <SurfaceCard variant="default" padding="md" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {teamLuck.gradeLabel ? (
            <p className="text-foreground text-lg font-bold">{teamLuck.gradeLabel}</p>
          ) : null}
          {teamLuck.computedLabel ? (
            <p className="text-muted-foreground text-xs tabular-nums">{teamLuck.computedLabel}</p>
          ) : null}
        </div>
        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          {teamLuck.teammatePerformanceLabel ? (
            <div>
              <dt className="text-muted-foreground">팀원 평균 성과</dt>
              <dd className="text-foreground mt-1 font-semibold tabular-nums">
                {teamLuck.teammatePerformanceLabel.replace('팀원 평균 성과 ', '')}
              </dd>
            </div>
          ) : null}
          {teamLuck.carryBurdenLabel ? (
            <div>
              <dt className="text-muted-foreground">캐리 부담</dt>
              <dd className="text-foreground mt-1 font-semibold tabular-nums">
                {teamLuck.carryBurdenLabel.replace('캐리 부담 ', '')}
              </dd>
            </div>
          ) : null}
        </dl>
      </SurfaceCard>
    </section>
  )
}
