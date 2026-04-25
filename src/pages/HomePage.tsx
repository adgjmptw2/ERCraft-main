import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { PlayerRow } from '@/components/player'
import { SkeletonCard, SourceBadge } from '@/components/shared'
import { searchPlayers } from '@/api/player'
import { useDebounce } from '@/hooks/useDebounce'
import { getErrorMessage } from '@/utils/errorMessage'

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
        <p className="text-muted-foreground text-sm">이터널 리턴 플레이어 검색 (mock 데이터)</p>
      </header>

      <label className="flex flex-col gap-2 text-sm font-medium">
        플레이어 닉네임
        <input
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="2자 이상 입력"
          autoComplete="off"
        />
      </label>

      {canSearch && isFetching ? (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {canSearch && isError ? (
        <p className="text-destructive text-sm" role="alert">
          {getErrorMessage(error, '검색에 실패했습니다')}
        </p>
      ) : null}

      {canSearch && !isFetching && !isError ? (
        players.length === 0 ? (
          <p className="text-muted-foreground text-sm">검색 결과가 없습니다</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data?.source ? (
              <div className="flex items-center gap-2">
                <SourceBadge source={data.source} />
              </div>
            ) : null}
            <ul className="divide-border divide-y rounded-md border">
              {players.map((p) => (
                <PlayerRow key={p.userNum} player={p} />
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  )
}
