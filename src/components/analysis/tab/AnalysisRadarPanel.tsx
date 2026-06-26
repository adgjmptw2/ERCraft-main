import type { AnalysisAxisRow } from '@/analysis/analysisTabViewModel'
import { formatAnalysisScore } from '@/analysis/analysisFormatters'
import { AnalysisEmptyState } from '@/components/analysis/tab/AnalysisEmptyState'
import { AnalysisRadarCard } from '@/components/analysis/tab/AnalysisRadarCard'
import { SurfaceCard } from '@/components/shared'
import { cn } from '@/lib/utils'

export interface AnalysisRadarPanelProps {
  nickname: string
  headline: string
  insightLine: string
  analysisScore: number | null
  chartData: { subject: string; value: number; tierAvg: number; fullMark: number }[]
  axisRows: AnalysisAxisRow[]
  basisLabel: string
  showTrendBasis?: boolean
  characterLabel?: string | null
  className?: string
}

function ScoreRing({ score, grade }: { score: number; grade?: string | null }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const filled = Math.min(Math.max(score / 100, 0), 1) * circ

  return (
    <svg width="72" height="72" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        className="transition-all duration-700"
      />
      {grade ? (
        <text
          x="36" y="36"
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          fontSize="11"
          fontWeight="700"
          style={{ transform: 'rotate(90deg)', transformOrigin: '36px 36px' }}
          className="text-foreground"
        >
          {grade}
        </text>
      ) : null}
    </svg>
  )
}

export function AnalysisRadarPanel({
  nickname,
  headline: _headline,
  insightLine: _insightLine,
  analysisScore,
  chartData,
  axisRows,
  basisLabel,
  showTrendBasis = true,
  characterLabel,
  className,
}: AnalysisRadarPanelProps) {
  const axisLabels = chartData.length > 0
    ? chartData.map((point) => point.subject).join(' · ')
    : '생존 · 교전 · 운영 · 지원 · 마무리 · 일관성'

  return (
    <section
      className={cn('flex min-w-0 flex-col gap-3', className)}
      aria-labelledby="analysis-playstyle-heading"
    >
      <div className="space-y-0.5 px-0.5">
        <h3 id="analysis-playstyle-heading" className="text-foreground text-sm font-semibold">
          {characterLabel ? `${characterLabel} · 플레이 레이더` : '플레이 레이더'}
        </h3>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {characterLabel
            ? showTrendBasis
              ? `선택한 캐릭터의 ${basisLabel} 플레이 경향입니다`
              : '선택한 캐릭터의 플레이 경향입니다'
            : showTrendBasis
              ? `${basisLabel} · ${axisLabels}`
              : axisLabels}
        </p>
      </div>

      {analysisScore != null ? (
        <div className="from-primary/8 border-primary/15 flex items-center justify-between gap-4 rounded-xl border bg-gradient-to-r via-card to-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">종합 분석 점수</p>
            <p className="text-foreground text-4xl font-black tabular-nums leading-none">
              {formatAnalysisScore(analysisScore)}
            </p>
          </div>
          <ScoreRing score={analysisScore} />
        </div>
      ) : null}

      <SurfaceCard variant="default" padding="md" className="space-y-3">
        {chartData.length > 0 ? (
          <AnalysisRadarCard
            nickname={nickname}
            chartData={chartData}
            axisRows={axisRows}
            embedded
          />
        ) : (
          <AnalysisEmptyState description="표본이 부족해 플레이스타일 분석을 보류했어요." />
        )}
      </SurfaceCard>
    </section>
  )
}
