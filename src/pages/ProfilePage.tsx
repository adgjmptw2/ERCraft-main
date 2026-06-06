import { Link, useParams } from 'react-router-dom'

import { MatchRow } from '@/components/player'
import {
  DemoDataNotice,
  EmptyState,
  Skeleton,
  SkeletonCard,
  SourceBadge,
  StatCard,
  TierBadge,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useMatchDTOHistory } from '@/hooks/useMatchDTOHistory'
import { usePlayerStatsDTO } from '@/hooks/usePlayerStatsDTO'
import { usePlayerSummary } from '@/hooks/usePlayerSummary'
import { getErrorMessage } from '@/utils/errorMessage'

export function ProfilePage() {
  const { nickname: nicknameParam } = useParams()
  const nickname = nicknameParam ? decodeURIComponent(nicknameParam) : ''

  const summaryQuery = usePlayerSummary(nickname)
  const userNum = summaryQuery.data?.userNum ?? 0
  const statsQuery = usePlayerStatsDTO(userNum, summaryQuery.data?.tier)
  const matchesQuery = useMatchDTOHistory(userNum)

  if (!nickname.trim()) {
    return (
      <div className="mx-auto max-w-lg p-4 text-left sm:p-6">
        <EmptyState
          title="URL에 플레이어 닉네임이 없습니다."
          action={
            <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
              홈으로
            </Link>
          }
        />
      </div>
    )
  }

  if (summaryQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 p-4 text-left sm:p-6">
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
      <div className="mx-auto max-w-lg space-y-4 p-4 text-left sm:p-6">
        <p className="text-destructive text-sm" role="alert">
          {getErrorMessage(summaryQuery.error, '프로필 정보를 불러오지 못했습니다')}
        </p>
        <Link className="text-primary inline-block text-sm underline-offset-4 hover:underline" to="/">
          홈으로
        </Link>
      </div>
    )
  }

  if (summaryQuery.data === null) {
    return (
      <div className="mx-auto max-w-lg p-4 text-left sm:p-6">
        <EmptyState
          title="데모 데이터에 없는 플레이어입니다."
          description="홈에서 샘플 닉네임으로 검색해보세요."
          action={
            <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
              홈으로
            </Link>
          }
        />
      </div>
    )
  }

  const summary = summaryQuery.data
  const matchItems = matchesQuery.data?.pages.flatMap((page) => page.data.items) ?? []
  const matchesSource = matchesQuery.data?.pages[0]?.source
  const stats = statsQuery.data?.data

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 p-4 text-left sm:p-6">
      <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
        ← 검색으로
      </Link>

      <header className="space-y-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight break-all">{summary.nickname}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span>레벨 {summary.level}</span>
            <TierBadge tier={summary.tier} />
          </div>
        </div>
        <DemoDataNotice compact />
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
        ) : statsQuery.isSuccess && stats ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="티어" value={stats.tier} />
            <StatCard label="MMR" value={stats.mmr} />
            <StatCard label="승률" value={`${stats.winRate}%`} />
            <StatCard label="KDA" value={stats.kdaString} />
            <StatCard label="총 판수" value={stats.games} />
            <StatCard label="평균 순위" value={stats.avgPlacement.toFixed(2)} />
            <StatCard label="평균 킬" value={stats.avgKills.toFixed(2)} />
            <StatCard
              label="주 캐릭터"
              value={stats.mostPlayedCharacter.name}
              description={`${stats.mostPlayedCharacter.count}판`}
              className="sm:col-span-2"
            />
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
          <EmptyState title="기록된 전적이 없습니다." />
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
                className="w-full sm:w-auto"
                disabled={matchesQuery.isFetchingNextPage}
                onClick={() => void matchesQuery.fetchNextPage()}
              >
                {matchesQuery.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
