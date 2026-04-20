import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { fetchPlayerByNickname, fetchPlayerStats } from '@/api/player'
import { useMatchHistory } from '@/hooks/useMatchHistory'

function formatWinRate(wins: number, games: number): string {
  if (games <= 0) return '0'
  return ((wins / games) * 100).toFixed(1)
}

function formatKda(kills: number, deaths: number, assists: number): string {
  if (deaths <= 0) return (kills + assists).toFixed(2)
  return ((kills + assists) / deaths).toFixed(2)
}

function formatMatchDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export function ProfilePage() {
  const { nickname: nicknameParam } = useParams()
  const nickname = nicknameParam ? decodeURIComponent(nicknameParam) : ''

  const profileQuery = useQuery({
    queryKey: ['player', 'profile', nickname],
    queryFn: async () => {
      const profile = await fetchPlayerByNickname(nickname)
      const summary = profile.data
      if (!summary) return null
      const statsResult = await fetchPlayerStats(summary.userNum)
      return { summary, stats: statsResult.data }
    },
    enabled: nickname.trim().length > 0,
  })

  const userNum = profileQuery.data?.summary.userNum ?? 0
  const matchesQuery = useMatchHistory(userNum)

  if (!nickname.trim()) {
    return (
      <div className="mx-auto max-w-lg p-6 text-left">
        <p className="text-muted-foreground text-sm">Missing player nickname in URL.</p>
        <Link className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline" to="/">
          Back to search
        </Link>
      </div>
    )
  }

  if (profileQuery.isPending) {
    return (
      <div className="mx-auto max-w-lg p-6 text-left">
        <p className="text-muted-foreground text-sm">Loading profile…</p>
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <div className="mx-auto max-w-lg p-6 text-left">
        <p className="text-destructive text-sm" role="alert">
          {profileQuery.error instanceof Error ? profileQuery.error.message : 'Failed to load profile'}
        </p>
        <Link className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline" to="/">
          Back to search
        </Link>
      </div>
    )
  }

  if (!profileQuery.data) {
    return (
      <div className="mx-auto max-w-lg p-6 text-left">
        <p className="text-muted-foreground text-sm">Player not found.</p>
        <Link className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline" to="/">
          Back to search
        </Link>
      </div>
    )
  }

  const { summary, stats } = profileQuery.data
  const firstPageItems = matchesQuery.data?.pages[0]?.data.items ?? []
  const recentMatches = firstPageItems.slice(0, 5)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 p-6 text-left">
      <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
        ← Search
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{summary.nickname}</h1>
        <p className="text-muted-foreground text-sm">
          Level {summary.level} · {summary.tier}
        </p>
      </header>

      <section className="space-y-2 text-sm">
        <h2 className="text-foreground font-medium">Stats</h2>
        <p>Win rate: {formatWinRate(stats.wins, stats.games)}%</p>
        <p>
          KDA: {formatKda(stats.kills, stats.deaths, stats.assists)} ({stats.kills}/{stats.deaths}/
          {stats.assists})
        </p>
        <p>Total games: {stats.games}</p>
        {stats.avgPlacement !== undefined ? (
          <p>Avg. placement: {stats.avgPlacement.toFixed(2)}</p>
        ) : null}
        {stats.avgKills !== undefined ? <p>Avg. kills: {stats.avgKills.toFixed(2)}</p> : null}
      </section>

      <section className="space-y-3 text-sm">
        <h2 className="text-foreground font-medium">Recent matches</h2>
        {matchesQuery.isPending ? (
          <p className="text-muted-foreground">Loading matches…</p>
        ) : matchesQuery.isError ? (
          <p className="text-destructive" role="alert">
            {matchesQuery.error instanceof Error ? matchesQuery.error.message : 'Failed to load matches'}
          </p>
        ) : recentMatches.length === 0 ? (
          <p className="text-muted-foreground">No matches on record.</p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {recentMatches.map((m) => (
              <li key={m.matchId} className="space-y-1 px-3 py-2">
                <p className="font-medium">{m.characterName}</p>
                <p>
                  Placement {m.placement} · {m.kills}/{m.deaths}/{m.assists}
                </p>
                <p className="text-muted-foreground text-xs">{formatMatchDate(m.gameStartedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
