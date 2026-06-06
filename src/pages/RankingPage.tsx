import { Link } from 'react-router-dom'

import { DemoDataNotice, EmptyState, TierBadge } from '@/components/shared'
import { MOCK_RANKING_ENTRIES } from '@/mocks/rankings'

function winRatePercent(wins: number, games: number): string {
  if (games <= 0) return '-'
  return `${Math.round((wins / games) * 100)}%`
}

export function RankingPage() {
  const entries = MOCK_RANKING_ENTRIES

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-8 p-4 text-left sm:p-6">
      <header className="space-y-3">
        <Link className="text-primary inline-flex min-h-9 items-center text-sm underline-offset-4 hover:underline" to="/">
          ← 홈으로
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">데모 랭킹</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            샘플 데이터로 랭킹 화면을 미리 확인하고, 프로필로 이동해 플레이 리포트를 탐색해보세요.
          </p>
        </div>
        <DemoDataNotice compact />
      </header>

      {entries.length === 0 ? (
        <EmptyState title="표시할 랭킹 데이터가 없습니다" />
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.userNum}
              className="rounded-md border border-border bg-card p-3.5 text-sm"
            >
              <div className="flex items-start gap-3">
                <span
                  className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold"
                  aria-label={`${entry.rank}위`}
                >
                  {entry.rank}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      className="text-foreground min-w-0 font-medium break-all underline-offset-4 hover:underline"
                      to={`/player/${encodeURIComponent(entry.nickname)}`}
                    >
                      {entry.nickname}
                    </Link>
                    <TierBadge tier={entry.tier} />
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span>MMR {entry.mmr}</span>
                    <span>{entry.games}판</span>
                    <span>승률 {winRatePercent(entry.wins, entry.games)}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
