import { useQuery } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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
import { fetchBenchmarkStatus } from '@/api/benchmark'
import { isRealMode } from '@/api/erClient'
import { searchPlayers } from '@/api/player'
import { useDebounce } from '@/hooks/useDebounce'
import { buildPlayerProfilePath } from '@/utils/profilePath'
import { mapSearchErrorToUserMessage } from '@/utils/searchErrorMessage'

const realMode = isRealMode()

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatCompactCount(value: number): string {
  return new Intl.NumberFormat('ko-KR', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value)
}

function statusLabel(value: 'stable' | 'validation'): string {
  return value === 'validation' ? '검증 모드' : '안정 기준'
}

export function HomePage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const debounced = useDebounce(input, 500)
  const trimmed = debounced.trim()
  const inputTrimmed = input.trim()
  const canSearch = inputTrimmed.length >= 2
  const hasInput = inputTrimmed.length > 0
  const tooShort = hasInput && inputTrimmed.length < 2

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['players', 'search', trimmed],
    queryFn: () => searchPlayers(trimmed),
    enabled: canSearch && !realMode,
  })

  const benchmarkStatus = useQuery({
    queryKey: ['benchmark', 'status'],
    queryFn: fetchBenchmarkStatus,
    staleTime: 60_000,
  })

  const players = data?.data ?? []
  const collectedStatus =
    benchmarkStatus.data?.localCollectedGames ?? benchmarkStatus.data?.collectedGames
  const roleStatus = benchmarkStatus.data?.localCollectedGames?.byRole ?? []
  const isLocalCollectedStatus = Boolean(benchmarkStatus.data?.localCollectedGames)

  function goToProfile(nickname: string) {
    const term = nickname.trim()
    if (term.length < 2) return
    navigate(buildPlayerProfilePath(term))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inputTrimmed.length < 2) return
    goToProfile(input)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-5 lg:items-stretch">
        <SurfaceCard
          variant="accent"
          padding="lg"
          className="relative overflow-hidden lg:col-span-2"
        >
          <div className="from-primary/8 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />
          <div className="relative flex h-full flex-col justify-center space-y-3">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">플레이 리포트</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-[1.75rem] lg:leading-tight xl:text-3xl">
              이터널 리턴 전적을 검색하고, 최근 플레이 흐름을 분석해보세요
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {realMode
                ? '닉네임으로 전적을 검색하고 최근 플레이 흐름을 확인하세요.'
                : '최근 매치 기반으로 강점과 개선 포인트를 보여주는 플레이 리포트 · 데모 데이터로 미리 체험'}
            </p>
            {!realMode ? <DemoDataNotice compact /> : null}
          </div>
        </SurfaceCard>

        <SurfaceCard padding="lg" variant="elevated" className="space-y-4 lg:col-span-3">
          <SectionHeader
            title="플레이어 검색"
            description={
              realMode
                ? '게임 내 닉네임을 정확히 입력한 뒤 검색하세요. (부분 일치는 지원하지 않습니다)'
                : '닉네임으로 프로필과 플레이 리포트를 확인합니다.'
            }
          />
          <form onSubmit={handleSubmit} className="space-y-2">
            <label htmlFor="player-search" className="flex flex-col gap-2 text-sm font-medium">
              닉네임
              <div className="flex gap-2">
                <Input
                  id="player-search"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={realMode ? '정확한 닉네임 입력' : '2자 이상 입력 · 예: 마인'}
                  autoComplete="off"
                  className="bg-background/80 h-10 min-w-0 flex-1"
                  aria-describedby={tooShort ? 'search-hint' : undefined}
                />
                <Button type="submit" className="shrink-0" disabled={!canSearch}>
                  검색
                </Button>
              </div>
            </label>

            {tooShort ? (
              <p id="search-hint" className="text-muted-foreground text-xs">
                2자 이상 입력해주세요.
              </p>
            ) : null}

            {realMode && canSearch ? (
              <p className="text-muted-foreground text-xs">
                Enter 또는 검색 버튼을 누르면 프로필을 조회합니다. 자동완성 목록이 없어도 검색됩니다.
              </p>
            ) : null}
          </form>
        </SurfaceCard>
      </div>

      <SurfaceCard padding="md" variant="elevated" className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeader
            title="라이브 기준 현황"
            description={
              isLocalCollectedStatus
                ? '현재 ERCraft DB에 수집된 PlayerMatch 기준입니다.'
                : '같은 티어·실험체·무기 조건의 통계 기준과 비교합니다.'
            }
          />
          {collectedStatus ? (
            <div className="text-muted-foreground space-y-0.5 text-right text-xs">
              <p>
                수집된 데이터 판 수{' '}
                <span className="text-foreground font-semibold">
                  {formatCompactCount(collectedStatus.total)}
                </span>
              </p>
              {benchmarkStatus.data?.localCollectedGames?.generatedAt ? (
                <p>
                  갱신 {formatGeneratedAt(benchmarkStatus.data.localCollectedGames.generatedAt)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {benchmarkStatus.isLoading ? (
          <div className="grid gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="bg-muted h-11 animate-pulse rounded-md"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : null}

        {benchmarkStatus.data && collectedStatus ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {collectedStatus.byTier.map((tier) => (
                <div
                  key={tier.tierKey}
                  className="border-border bg-muted/40 flex min-w-[6.25rem] items-center justify-between gap-2 rounded-md border px-2.5 py-2"
                >
                  <span className="text-muted-foreground text-xs">{tier.label}</span>
                  <span className="text-sm font-semibold">{formatCompactCount(tier.games)}</span>
                </div>
              ))}
            </div>
            {roleStatus.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {roleStatus.map((role) => (
                  <div
                    key={role.role}
                    className="border-border/70 bg-background/70 flex min-w-[6.25rem] items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
                  >
                    <span className="text-muted-foreground text-xs">{role.role}</span>
                    <span className="text-xs font-semibold">{formatCompactCount(role.games)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {isLocalCollectedStatus ? <span>내 DB 수집 기준</span> : null}
              {benchmarkStatus.data?.localCollectedGames?.matchesPerMinute != null ? (
                <span>
                  최근 1시간 수집 속도 약{' '}
                  {benchmarkStatus.data.localCollectedGames.matchesPerMinute}판/분
                </span>
              ) : null}
              <span>{benchmarkStatus.data.live.message}</span>
              <span>역할: {statusLabel(benchmarkStatus.data.live.roleMetrics)}</span>
              <span>교전: {statusLabel(benchmarkStatus.data.live.combatMetrics)}</span>
              <span>
                스냅샷:{' '}
                {benchmarkStatus.data.live.snapshot === 'ready' ? '준비됨' : '기본값 사용'}
              </span>
            </div>
          </div>
        ) : null}

        {benchmarkStatus.isError ? (
          <p className="text-muted-foreground text-xs">
            기준 현황을 불러오지 못했습니다. 검색과 프로필 조회는 계속 사용할 수 있습니다.
          </p>
        ) : null}
      </SurfaceCard>

      <section aria-live="polite" className="min-h-[6rem] space-y-3">
        {!hasInput && !canSearch ? (
          <EmptyState
            title="닉네임을 입력해주세요"
            description={
              realMode
                ? '정확한 닉네임을 입력하고 검색 버튼을 눌러주세요.'
                : '데모 데이터에 포함된 닉네임만 검색됩니다.'
            }
          />
        ) : null}

        {!realMode && canSearch && isFetching ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">검색 중…</p>
            <div className="grid gap-3 md:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ) : null}

        {!realMode && canSearch && isError ? (
          <EmptyState
            title="검색에 실패했습니다"
            description={mapSearchErrorToUserMessage(error)}
          />
        ) : null}

        {!realMode && canSearch && !isFetching && !isError && players.length === 0 ? (
          <EmptyState
            title="데모 데이터에 없는 닉네임입니다"
            description="데모 JSON에 포함된 닉네임만 조회됩니다. 검색 버튼으로 프로필을 열 수도 있습니다."
          />
        ) : null}

        {!realMode && canSearch && !isFetching && !isError && players.length > 0 ? (
          <SurfaceCard padding="none" variant="elevated" className="overflow-hidden">
            <div className="border-border border-b px-4 py-3 sm:px-5">
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

      {!realMode ? (
        <footer className="border-border border-t pt-3">
          <Link
            className="text-primary inline-flex min-h-9 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            to="/ranking"
          >
            데모 랭킹에서 다른 플레이어 탐색 →
          </Link>
        </footer>
      ) : null}
    </div>
  )
}
