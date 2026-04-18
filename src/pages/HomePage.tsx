import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { searchPlayers } from '@/api/player'
import { useDebounce } from '@/hooks/useDebounce'

export function HomePage() {
  const [input, setInput] = useState('')
  const debounced = useDebounce(input, 500)
  const canSearch = debounced.trim().length >= 2

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['players', 'search', debounced.trim()],
    queryFn: () => searchPlayers(debounced.trim()),
    enabled: canSearch,
  })

  const players = data?.data ?? []

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6 text-left">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">ERCraft</h1>
        <p className="text-muted-foreground text-sm">Search Eternal Return players (mock data).</p>
      </header>

      <label className="flex flex-col gap-2 text-sm font-medium">
        Player nickname
        <input
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type at least 2 characters"
          autoComplete="off"
        />
      </label>

      {canSearch && isFetching ? <p className="text-muted-foreground text-sm">Searching…</p> : null}

      {canSearch && isError ? (
        <p className="text-destructive text-sm" role="alert">
          {error instanceof Error ? error.message : 'Search failed'}
        </p>
      ) : null}

      {canSearch && !isFetching && !isError ? (
        players.length === 0 ? (
          <p className="text-muted-foreground text-sm">No players found</p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {players.map((p) => (
              <li key={p.userNum} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{p.nickname}</span>
                <Link
                  className="text-primary font-medium underline-offset-4 hover:underline"
                  to={`/player/${encodeURIComponent(p.nickname)}`}
                >
                  View profile
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
