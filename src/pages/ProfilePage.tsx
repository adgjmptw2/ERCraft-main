import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { MatchRow } from '@/components/player'
import { Skeleton, SkeletonCard, SourceBadge, TierBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { fetchPlayerByNickname } from '@/api/player'
import { useMatchDTOHistory } from '@/hooks/useMatchDTOHistory'
import { usePlayerStatsDTO } from '@/hooks/usePlayerStatsDTO'
import { getErrorMessage } from '@/utils/errorMessage'

export function ProfilePage() {
  const { nickname: nicknameParam } = useParams()
  const nickname = nicknameParam ? decodeURIComponent(nicknameParam) : ''

  const summaryQuery = useQuery({
    queryKey: ['player', 'summary', nickname],
    queryFn: async () => {
      const res = await fetchPlayerByNickname(nickname)
      return res.data
    },
    enabled: nickname.length > 0,
  })

  const userNum = summaryQuery.data?.userNum ?? 0
  const statsQuery = usePlayerStatsDTO(userNum)
  const matchesQuery = useMatchDTOHistory(userNum)

  if (!nickname.trim()) {
    return (
      <div className="mx-auto max-w-lg p-6 text-left">
        <p className="text-muted-foreground text-sm">URL에 플레이어 닉네임이 없습니다.</p>
        <Link className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline" to="/">
          홈으로
        </Link>
      </div>
    )
  }

  if (summaryQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 p-6 text-left">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 max-w-full" />
          <Skeleton className="h-6 w-40 max-w-full" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (summaryQuery.isError) {
    return (
      <div className="mx-auto max-w-lg p-6 text-left">
        <p className="text-destructive text-sm" role="alert">
          {getErrorMessage(summaryQuery.error, '프로필 정보를 불러오지 못했습니다')}
        </p>
        <Link className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline" to="/">
          홈으로
        </Link>
      </div>
    )
  }

  if (summaryQuery.data === null) {
    return (
      <div className="mx-auto max-w-lg p-6 text-left">
        <p className="text-muted-foreground text-sm">플레이어를 찾을 수 없습니다.</p>
        <Link className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline" to="/">
          홈으로
        </Link>
      </div>
    )
  }

  const summary = summaryQuery.data
  const matchItems = matchesQuery.data?.pages.flatMap((page) => page.data.items) ?? []
  const matchesSource = matchesQuery.data?.pages[0]?.source

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 p-6 text-left">
      <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
        ← 검색으로
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{summary.nickname}</h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span>레벨 {summary.level}</span>
          <TierBadge tier={summary.tier} />
        </div>
      </header>

      <section className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-foreground font-medium">시즌 통계</h2>
          {statsQuery.isSuccess && statsQuery.data?.source ? (
            <SourceBadge source={statsQuery.data.source} />
          ) : null}
        </div>
        {statsQuery.isPending ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : statsQuery.isError ? (
          <p className="text-destructive" role="alert">
            {getErrorMessage(statsQuery.error, '통계 정보를 불러오지 못했습니다')}
          </p>
        ) : statsQuery.isSuccess ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-muted-foreground text-xs">승률</p>
              <p className="text-lg font-semibold">{statsQuery.data.data.winRate}%</p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-muted-foreground text-xs">KDA</p>
              <p className="text-lg font-semibold">{statsQuery.data.data.kdaString}</p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-muted-foreground text-xs">총 판수</p>
              <p className="text-lg font-semibold">{statsQuery.data.data.games}</p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-muted-foreground text-xs">평균 순위</p>
              <p className="text-lg font-semibold">{statsQuery.data.data.avgPlacement.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-muted-foreground text-xs">평균 킬</p>
              <p className="text-lg font-semibold">{statsQuery.data.data.avgKills.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-border bg-card p-3 sm:col-span-2">
              <p className="text-muted-foreground text-xs">주 캐릭터</p>
              <p className="text-lg font-semibold">{statsQuery.data.data.mostPlayedCharacter.name}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-foreground font-medium">최근 전적</h2>
          {matchesSource ? <SourceBadge source={matchesSource} /> : null}
        </div>
        {matchesQuery.isPending ? (
          <div className="grid gap-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : matchesQuery.isError ? (
          <p className="text-destructive" role="alert">
            {getErrorMessage(matchesQuery.error, '전적 정보를 불러오지 못했습니다')}
          </p>
        ) : matchItems.length === 0 ? (
          <p className="text-muted-foreground">기록된 전적이 없습니다.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {matchItems.map((m) => (
                <MatchRow key={m.matchId} match={m} />
              ))}
            </ul>
            {matchesQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                disabled={matchesQuery.isFetchingNextPage}
                onClick={() => void matchesQuery.fetchNextPage()}
              >
                더 보기
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
