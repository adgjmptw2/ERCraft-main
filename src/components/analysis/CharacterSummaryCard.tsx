import { GradeBadge } from '@/components/analysis/GradeBadge'
import type { CharacterAnalysisReport } from '@/analysis/types'
import { cn } from '@/lib/utils'

function fmtRate(value: number): string {
  return `${value.toFixed(1)}%`
}

export interface CharacterSummaryCardProps {
  report: CharacterAnalysisReport
}

export function CharacterSummaryCard({ report }: CharacterSummaryCardProps) {
  const insufficient = report.matchCount < 2

  return (
    <article className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-medium">{report.characterName}</h4>
        {insufficient ? (
          <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium">
            표본 부족
          </span>
        ) : (
          <GradeBadge grade={report.overallGrade} />
        )}
      </div>

      <p className="text-muted-foreground mt-1 text-xs">{report.matchCount}경기 · 룰 기반</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">평균 순위</dt>
          <dd className="font-medium">{report.avgPlacement.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">KDA</dt>
          <dd className="font-medium">{report.kda.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">평균 킬</dt>
          <dd>{report.avgKills.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">평균 어시스트</dt>
          <dd>{report.avgAssists.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">상위 3위 비율</dt>
          <dd>{fmtRate(report.top3Rate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">승리 비율</dt>
          <dd>{fmtRate(report.winRate)}</dd>
        </div>
      </dl>

      <p className={cn('text-muted-foreground mt-3 text-xs leading-relaxed')}>{report.feedback}</p>
    </article>
  )
}
