import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PlayerRow } from '@/components/player'
import {
  DemoDataNotice,
  EmptyState,
  SkeletonCard,
  SourceBadge,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchPlayers } from '@/api/player'
import { useDebounce } from '@/hooks/useDebounce'
import { getSamplePlayerNicknames } from '@/mocks/loader'
import { getErrorMessage } from '@/utils/errorMessage'

const sampleNicknames = getSamplePlayerNicknames()

export function HomePage() {
  const [input, setInput] = useState('')
  const debounced = useDebounce(input, 500)
  const trimmed = debounced.trim()
  const canSearch = trimmed.length >= 2
  const hasInput = input.trim().length > 0
  const tooShort = hasInput && input.trim().length < 2

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['players', 'search', trimmed],
    queryFn: () => searchPlayers(trimmed),
    enabled: canSearch,
  })

  const players = data?.data ?? []

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-4 text-left sm:p-6">
      <header className="space-y-3">
        <div className="space-y-2">
          <p className="text-primary text-xs font-medium tracking-wide uppercase">ERCraft</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            이터널 리턴 전적을 빠르게 검색하고 최근 매치를 확인하세요
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            API 연동 전 데모 데이터로 검색 흐름을 먼저 체험할 수 있습니다.
          </p>
        </div>
        <DemoDataNotice />
      </header>

      <section className="space-y-3">
        <label htmlFor="player-search" className="flex flex-col gap-2 text-sm font-medium">
          플레이어 닉네임
          <Input
            id="player-search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="2자 이상 입력"
            autoComplete="off"
            aria-describedby={tooShort ? 'search-hint' : undefined}
          />
        </label>

        {tooShort ? (
          <p id="search-hint" className="text-muted-foreground text-xs">
            2자 이상 입력해주세요.
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">샘플 플레이어</p>
          <div className="flex flex-wrap gap-2">
            {sampleNicknames.map((nickname) => (
              <Button
                key={nickname}
                type="button"
                variant="outline"
                size="sm"
                className="max-w-full truncate"
                onClick={() => setInput(nickname)}
              >
                {nickname}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section aria-live="polite" className="min-h-[8rem]">
        {!hasInput && !canSearch ? (
          <EmptyState
            title="닉네임을 입력하거나 샘플 플레이어를 선택해보세요."
            description="데모 데이터에 포함된 플레이어만 검색됩니다."
          />
        ) : null}

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

        {canSearch && !isFetching && !isError && players.length === 0 ? (
          <EmptyState
            title="데모 데이터에 없는 닉네임입니다."
            description="API 연동 후에는 실제 닉네임 기준으로 검색될 예정입니다."
          />
        ) : null}

        {canSearch && !isFetching && !isError && players.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-xs">검색 결과 {players.length}명</p>
              {data?.source ? <SourceBadge source={data.source} /> : null}
            </div>
            <ul className="divide-border divide-y rounded-md border">
              {players.map((p) => (
                <PlayerRow key={p.userNum} player={p} />
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <footer className="border-border mt-auto border-t pt-4">
        <Link
          className="text-primary text-sm underline-offset-4 hover:underline"
          to="/ranking"
        >
          데모 랭킹 보기 →
        </Link>
      </footer>
    </div>
  )
}
