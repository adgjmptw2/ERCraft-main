import type { DemoPlayerCompactSummary } from '@/mocks/loader'
import { cn } from '@/lib/utils'

export interface ProfileCompactSummaryProps {
  summary: DemoPlayerCompactSummary
  className?: string
}

function formatNullableNumber(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toFixed(digits)
}

function formatCount(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '-'
  return Math.round(value).toLocaleString('ko-KR')
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/35 border-border/50 rounded-md border px-2 py-1.5">
      <p className="text-muted-foreground text-[10px] font-medium tracking-wide">{label}</p>
      <p className="text-foreground text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function ProfileCompactSummary({ summary, className }: ProfileCompactSummaryProps) {
  const items = [
    { label: '평균 TK', value: formatNullableNumber(summary.averageTeamKills, 1) },
    { label: '승률', value: summary.winRate != null ? `${summary.winRate}%` : '-' },
    { label: '평균 순위', value: formatNullableNumber(summary.averagePlacement, 2) },
    { label: '평균 딜량', value: formatCount(summary.averageDamageToPlayers) },
    { label: '평균 시야', value: formatNullableNumber(summary.averageVisionScore, 1) },
    { label: '평균 동물 킬', value: formatNullableNumber(summary.averageAnimalKills, 1) },
  ]

  return (
    <div className={cn('border-border/60 space-y-2 border-t pt-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-foreground text-xs font-semibold">핵심 요약</h3>
        <span className="text-muted-foreground text-[10px]">
          {summary.sampleSize > 0 ? `데모 ${summary.sampleSize}경기 기준` : '데모 매치 없음'}
        </span>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3">
        {items.map((item) => (
          <CompactMetric key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  )
}
