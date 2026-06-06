import { CharacterSummaryCard } from '@/components/analysis/CharacterSummaryCard'
import { EmptyState } from '@/components/shared'
import type { CharacterAnalysisReport } from '@/analysis/types'

export interface CharacterReportPanelProps {
  reports: CharacterAnalysisReport[]
}

export function CharacterReportPanel({ reports }: CharacterReportPanelProps) {
  return (
    <section className="space-y-4 text-sm" aria-labelledby="character-report-heading">
      <div className="space-y-1">
        <h2 id="character-report-heading" className="text-foreground font-medium">
          캐릭터별 플레이 분석
        </h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          최근 데모 매치 기준으로 캐릭터별 안정성을 비교합니다. 내 최근 데모 매치 안에서의
          비교이며 공식 통계가 아닙니다.
        </p>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          title="분석할 캐릭터 매치가 없습니다"
          description="샘플 매치 기준으로 캐릭터별 데이터가 없어요."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.characterName}>
              <CharacterSummaryCard report={report} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
        데모 데이터 · 샘플 매치 기준 · 룰 기반 분석 · 2경기 미만 캐릭터는 표본 부족으로 표시됩니다.
      </p>
    </section>
  )
}
