import { Link } from 'react-router-dom'

import { DemoDataNotice, EmptyState, SurfaceCard, TierBadge } from '@/components/shared'
import { MOCK_RANKING_ENTRIES } from '@/mocks/rankings'
import { cn } from '@/lib/utils'
import { localizeTier } from '@/utils/gameLabels'
import { buildPlayerProfilePath } from '@/utils/profilePath'

function winRatePercent(wins: number, games: number): string {
  if (games <= 0) return '-'
  return `${Math.round((wins / games) * 100)}%`
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100'
  if (rank === 2) return 'border-slate-400/40 bg-slate-400/15 text-slate-900 dark:text-slate-100'
  if (rank === 3) return 'border-orange-500/40 bg-orange-500/15 text-orange-950 dark:text-orange-100'
  return 'border-border bg-muted/60 text-muted-foreground'
}

export function RankingPage() {
  const entries = MOCK_RANKING_ENTRIES

  return (
    <div className="flex flex-col gap-8">
      <SurfaceCard variant="accent" padding="lg" className="space-y-3">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">데모 RP 랭킹</h1>
          <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
            샘플 데이터 기준 RP 순위입니다. 프로필로 이동해 플레이 리포트와 RP 흐름을 확인해보세요.
          </p>
        </div>
        <DemoDataNotice compact />
      </SurfaceCard>

      {entries.length === 0 ? (
        <EmptyState title="표시할 랭킹 데이터가 없습니다" />
      ) : (
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {entries.map((entry) => (
            <li key={entry.userNum} className="min-w-0">
              <SurfaceCard
                padding="md"
                variant={entry.rank <= 3 ? 'elevated' : 'default'}
                interactive
                className={cn(entry.rank <= 3 && 'ring-primary/10 ring-1')}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-bold',
                      rankBadgeClass(entry.rank),
                    )}
                    aria-label={`${entry.rank}위`}
                  >
                    {entry.rank}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        className="text-foreground min-w-0 text-base font-semibold break-all underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        to={buildPlayerProfilePath(entry.nickname)}
                      >
                        {entry.nickname}
                      </Link>
                      <TierBadge tier={localizeTier(entry.tier)} />
                    </div>
                    <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm">
                      <span>RP {entry.mmr}</span>
                      <span>{entry.games}판</span>
                      <span>승률 {winRatePercent(entry.wins, entry.games)}</span>
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
