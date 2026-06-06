import { Link, useParams } from 'react-router-dom'
import { useMemo } from 'react'

import { CharacterReportPanel, PlayerReportPanel } from '@/components/analysis'
import { MatchRow } from '@/components/player'
import {
  DemoDataNotice,
  EmptyState,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  SourceBadge,
  StatCard,
  SurfaceCard,
  TierBadge,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useMatchDTOHistory } from '@/hooks/useMatchDTOHistory'
import { usePlayerStatsDTO } from '@/hooks/usePlayerStatsDTO'
import { usePlayerSummary } from '@/hooks/usePlayerSummary'
import { getDemoPlayerAnalysisReport, getDemoPlayerCharacterReports } from '@/mocks/loader'
import { getErrorMessage } from '@/utils/errorMessage'

export function ProfilePage() {
  const { nickname: nicknameParam } = useParams()
  const nickname = nicknameParam ? decodeURIComponent(nicknameParam) : ''

  const summaryQuery = usePlayerSummary(nickname)
  const userNum = summaryQuery.data?.userNum ?? 0
  const statsQuery = usePlayerStatsDTO(userNum, summaryQuery.data?.tier)
  const matchesQuery = useMatchDTOHistory(userNum)

  const analysisReport = useMemo(
    () =>
      summaryQuery.data
        ? getDemoPlayerAnalysisReport(summaryQuery.data.nickname)
        : null,
    [summaryQuery.data],
  )

  const characterReports = useMemo(
    () =>
      summaryQuery.data
        ? getDemoPlayerCharacterReports(summaryQuery.data.nickname)
        : [],
    [summaryQuery.data],
  )

  if (!nickname.trim()) {
    return (
      <EmptyState
        title="URL에 플레이어 닉네임이 없습니다"
        action={
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
            홈으로
          </Link>
        }
      />
    )
  }

  if (summaryQuery.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    )
  }

  if (summaryQuery.isError) {
    return (
      <EmptyState
        title="프로필 정보를 불러오지 못했습니다"
        description={getErrorMessage(summaryQuery.error, '잠시 후 다시 시도해주세요.')}
        action={
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
            홈으로
          </Link>
        }
      />
    )
  }

  if (summaryQuery.data === null) {
    return (
      <EmptyState
        title="데모 데이터에 없는 플레이어입니다"
        description="홈에서 샘플 닉네임으로 검색해보세요."
        action={
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
            홈으로
          </Link>
        }
      />
    )
  }

  const summary = summaryQuery.data
  const matchItems = matchesQuery.data?.pages.flatMap((page) => page.data.items) ?? []
  const matchesSource = matchesQuery.data?.pages[0]?.source
  const stats = statsQuery.data?.data

  return (
    <div className="flex flex-col gap-8">
      <SurfaceCard variant="muted" padding="lg" className="relative overflow-hidden">
        <div className="from-primary/6 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />
        <div className="relative space-y-3">
          <Link
            className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center text-xs transition-colors"
            to="/"
          >
            ← 검색으로
          </Link>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight break-all sm:text-3xl">
              {summary.nickname}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm">레벨 {summary.level}</span>
              <TierBadge tier={summary.tier} />
            </div>
          </div>
          <DemoDataNotice compact />
        </div>
      </SurfaceCard>

      <section className="space-y-3 text-sm">
        <SectionHeader
          title="시즌 요약"
          description="최근 데모 매치에서 집계한 기본 통계입니다."
          badge={
            statsQuery.isSuccess && statsQuery.data?.source ? (
              <SourceBadge source={statsQuery.data.source} />
            ) : undefined
          }
        />
        {statsQuery.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : statsQuery.isError ? (
          <EmptyState
            title="통계 정보를 불러오지 못했습니다"
            description={getErrorMessage(statsQuery.error, '잠시 후 다시 시도해주세요.')}
          />
        ) : statsQuery.isSuccess && stats ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="티어" value={stats.tier} highlight />
            <StatCard label="MMR" value={stats.mmr} highlight />
            <StatCard label="승률" value={`${stats.winRate}%`} />
            <StatCard label="KDA" value={stats.kdaString} />
            <StatCard label="총 판수" value={stats.games} />
            <StatCard label="평균 순위" value={stats.avgPlacement.toFixed(2)} />
            <StatCard label="평균 킬" value={stats.avgKills.toFixed(2)} />
            <StatCard
              label="주 캐릭터"
              value={stats.mostPlayedCharacter.name}
              description={`${stats.mostPlayedCharacter.count}판`}
              highlight
              className="sm:col-span-2"
            />
          </div>
        ) : null}
      </section>

      <SurfaceCard variant="inset" padding="lg" className="space-y-8">
        {analysisReport ? <PlayerReportPanel report={analysisReport} /> : null}
        <CharacterReportPanel reports={characterReports} />
      </SurfaceCard>

      <section className="space-y-3 text-sm">
        <SectionHeader
          title="최근 매치"
          description="분석에 사용된 최근 전적 흐름을 확인합니다."
          badge={matchesSource ? <SourceBadge source={matchesSource} /> : undefined}
        />
        {matchesQuery.isPending ? (
          <div className="grid gap-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : matchesQuery.isError ? (
          <EmptyState
            title="전적 정보를 불러오지 못했습니다"
            description={getErrorMessage(matchesQuery.error, '잠시 후 다시 시도해주세요.')}
          />
        ) : matchItems.length === 0 ? (
          <EmptyState title="기록된 전적이 없습니다" />
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
