import { CharacterSummaryCard } from '@/components/analysis/CharacterSummaryCard'
import { EmptyState, SectionHeader } from '@/components/shared'
import type { CharacterAnalysisReport } from '@/analysis/types'

export interface CharacterReportPanelProps {
  reports: CharacterAnalysisReport[]
}

export function CharacterReportPanel({ reports }: CharacterReportPanelProps) {
  return (
    <section className="space-y-4 text-sm" aria-labelledby="character-report-heading">
      <SectionHeader
        id="character-report-heading"
        title="캐릭터별 플레이 분석"
        description="내 최근 데모 매치 안에서 캐릭터별 안정성을 비교합니다."
      />

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
    </section>
  )
}
