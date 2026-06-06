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
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-4 text-left sm:p-6">
      <header className="space-y-3">
        <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
          ← 홈으로
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">데모 랭킹</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            API 연동 전 샘플 데이터로 랭킹 화면 레이아웃을 미리 확인할 수 있습니다. 공식
            랭킹과 무관합니다.
          </p>
        </div>
        <DemoDataNotice compact />
      </header>

      {entries.length === 0 ? (
        <EmptyState title="표시할 랭킹 데이터가 없습니다." />
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.userNum}
              className="rounded-md border border-border bg-card p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground w-6 shrink-0 font-mono text-xs">
                      #{entry.rank}
                    </span>
                    <Link
                      className="text-foreground truncate font-medium underline-offset-4 hover:underline"
                      to={`/player/${encodeURIComponent(entry.nickname)}`}
                    >
                      {entry.nickname}
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-8">
                    <TierBadge tier={entry.tier} />
                    <span className="text-muted-foreground text-xs">MMR {entry.mmr}</span>
                  </div>
                </div>
                <div className="text-muted-foreground shrink-0 text-right text-xs">
                  <p>{entry.games}판</p>
                  <p>승률 {winRatePercent(entry.wins, entry.games)}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
