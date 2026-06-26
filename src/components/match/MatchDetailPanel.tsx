import { Link } from 'react-router-dom'

import { DemoDataNotice, MetricPill, SectionHeader, SurfaceCard } from '@/components/shared'
import type { DemoMatchDetail } from '@/mocks/loader'
import { cn } from '@/lib/utils'
import { resolveCharacterDisplayName } from '@/utils/gameLabels'
import { buildPlayerProfilePath } from '@/utils/profilePath'

export interface MatchDetailPanelProps {
  detail: DemoMatchDetail
}

function formatRpDelta(delta: number | undefined): string | null {
  if (delta == null) return null
  if (delta === 0) return '±0'
  return delta > 0 ? `+${delta}` : String(delta)
}

export function MatchDetailPanel({ detail }: MatchDetailPanelProps) {
  const { match, nickname, kdaString, placementLabel, playedAtLabel, insight } = detail
  const rpDeltaLabel = formatRpDelta(match.rpDelta)

  return (
    <div className="flex flex-col gap-6">
      <SurfaceCard variant="accent" padding="lg" className="space-y-4">
        <Link
          className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          to={buildPlayerProfilePath(nickname)}
        >
          ← {nickname} 프로필
        </Link>
        <div className="space-y-2">
          <SectionHeader
            title="데모 매치 상세"
            description="샘플 매치 기준 분석 drill-down 화면입니다."
            size="lg"
          />
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight break-all sm:text-3xl">
              {resolveCharacterDisplayName(match.characterNum, match.characterName)}
            </h1>
            <span
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium',
                match.victory
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {match.victory ? '승리' : '패배'}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">{playedAtLabel}</p>
        </div>
        <DemoDataNotice compact />
      </SurfaceCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SurfaceCard padding="md">
          <p className="text-muted-foreground text-xs font-medium uppercase">순위</p>
          <p className="text-foreground mt-1 text-xl font-bold">{placementLabel}</p>
        </SurfaceCard>
        <SurfaceCard padding="md">
          <p className="text-muted-foreground text-xs font-medium uppercase">K / D / A</p>
          <p className="text-foreground mt-1 text-xl font-bold">
            {match.kills} / {match.deaths} / {match.assists}
          </p>
        </SurfaceCard>
        <SurfaceCard padding="md">
          <p className="text-muted-foreground text-xs font-medium uppercase">KDA</p>
          <p className="text-foreground mt-1 text-xl font-bold">{kdaString}</p>
        </SurfaceCard>
        <SurfaceCard padding="md">
          <p className="text-muted-foreground text-xs font-medium uppercase">경기 후 RP</p>
          <p className="text-foreground mt-1 text-xl font-bold">
            {match.rpAfter != null ? match.rpAfter : '-'}
          </p>
          {rpDeltaLabel ? (
            <p className="text-muted-foreground mt-0.5 text-xs">변화 {rpDeltaLabel}</p>
          ) : null}
        </SurfaceCard>
      </div>

      <SurfaceCard variant="inset" padding="lg" className="space-y-3">
        <SectionHeader title="샘플 해석" description="룰 기반 UI 문구입니다." size="default" />
        <p className="text-foreground text-sm leading-relaxed">{insight}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <MetricPill label="플레이어" value={nickname} />
          <MetricPill label="매치 ID" value={match.matchId} />
        </div>
      </SurfaceCard>
    </div>
  )
}
