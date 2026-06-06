import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PlayerRow } from '@/components/player'
import {
  DemoDataNotice,
  EmptyState,
  SectionHeader,
  SkeletonCard,
  SourceBadge,
  SurfaceCard,
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
    <div className="flex flex-col gap-8">
      <SurfaceCard variant="muted" padding="lg" className="relative overflow-hidden">
        <div className="from-primary/8 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />
        <div className="relative space-y-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              이터널 리턴 전적을 검색하고, 최근 플레이 흐름을 분석해보세요
            </h1>
            <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
              최근 매치 기반으로 강점과 개선 포인트를 보여주는 플레이 리포트 · 데모 데이터로
              미리 체험
            </p>
          </div>
          <DemoDataNotice compact />
        </div>
      </SurfaceCard>

      <SurfaceCard padding="lg" className="space-y-4">
        <SectionHeader
          title="플레이어 검색"
          description="닉네임으로 프로필과 플레이 리포트를 확인합니다."
        />
        <label htmlFor="player-search" className="flex flex-col gap-2 text-sm font-medium">
          닉네임
          <Input
            id="player-search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="2자 이상 입력"
            autoComplete="off"
            className="bg-background/80"
            aria-describedby={tooShort ? 'search-hint' : undefined}
          />
        </label>

        {tooShort ? (
          <p id="search-hint" className="text-muted-foreground text-xs">
            2자 이상 입력해주세요.
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            샘플 플레이어
          </p>
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
      </SurfaceCard>

      <section aria-live="polite" className="min-h-[6rem] space-y-3">
        {!hasInput && !canSearch ? (
          <EmptyState
            title="닉네임을 입력하거나 샘플 플레이어를 선택해보세요"
            description="데모 데이터에 포함된 플레이어만 검색됩니다."
          />
        ) : null}

        {canSearch && isFetching ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">검색 중…</p>
            <div className="flex flex-col gap-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ) : null}

        {canSearch && isError ? (
          <EmptyState
            title="검색에 실패했습니다"
            description={getErrorMessage(error, '잠시 후 다시 시도해주세요.')}
          />
        ) : null}

        {canSearch && !isFetching && !isError && players.length === 0 ? (
          <EmptyState
            title="데모 데이터에 없는 닉네임입니다"
            description="API 연동 후에는 실제 닉네임 기준으로 검색될 예정입니다."
          />
        ) : null}

        {canSearch && !isFetching && !isError && players.length > 0 ? (
          <SurfaceCard padding="none" className="overflow-hidden">
            <div className="border-border border-b px-4 py-3">
              <SectionHeader
                title={`검색 결과 ${players.length}명`}
                badge={data?.source ? <SourceBadge source={data.source} /> : undefined}
              />
            </div>
            <ul className="divide-border divide-y">
              {players.map((p) => (
                <PlayerRow key={p.userNum} player={p} />
              ))}
            </ul>
          </SurfaceCard>
        ) : null}
      </section>

      <footer className="border-border border-t pt-2">
        <Link
          className="text-primary inline-flex min-h-9 items-center text-sm font-medium underline-offset-4 hover:underline"
          to="/ranking"
        >
          데모 랭킹에서 다른 플레이어 탐색 →
        </Link>
      </footer>
    </div>
  )
}
