import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/shared'
import { CompactMatchTeam } from '@/components/player/CompactMatchTeam'
import { MatchDetailParticipantHeader } from '@/components/player/MatchDetailParticipantHeader'
import {
  MATCH_DETAIL_TABLE_CLASS,
  MATCH_DETAIL_TABLE_LAYOUT_CLASS,
} from '@/components/player/matchDetailParticipantLayout'
import { isCobaltGameMode } from '@/utils/gameMode'
import { cn } from '@/lib/utils'
import type { MatchDetailDTO } from '@/types/matchDetail'
import {
  mapMatchDetailErrorToUserMessage,
  MATCH_DETAIL_MISSING_GAME_ID_MESSAGE,
  MATCH_DETAIL_NOT_FOUND_MESSAGE,
} from '@/utils/matchDetailErrorMessage'
import {
  matchDetailPendingMessage,
  type MatchDetailPendingPhase,
} from '@/hooks/useMatchDetailPendingPhase'

export interface MatchDetailExpandPanelProps {
  gameId: string
  detail?: MatchDetailDTO | null
  isPending: boolean
  pendingPhase?: MatchDetailPendingPhase
  isError: boolean
  error?: unknown
  onRetry?: () => void
  className?: string
}

export function MatchDetailExpandPanel({
  gameId,
  detail,
  isPending,
  pendingPhase = 'loading',
  isError,
  error,
  onRetry,
  className,
}: MatchDetailExpandPanelProps) {
  const trimmedGameId = gameId.trim()

  if (!trimmedGameId) {
    return (
      <div className={cn('border-border/60 bg-muted/30 border-t p-3', className)}>
        <p className="text-muted-foreground text-xs">{MATCH_DETAIL_MISSING_GAME_ID_MESSAGE}</p>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className={cn('border-border/60 bg-muted/30 space-y-2 border-t p-3', className)}>
        <p className="text-muted-foreground text-xs">{matchDetailPendingMessage(pendingPhase)}</p>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (isError || !detail || detail.detailStatus === 'unavailable') {
    const message = isError
      ? mapMatchDetailErrorToUserMessage(error)
      : MATCH_DETAIL_NOT_FOUND_MESSAGE

    return (
      <div className={cn('border-border/60 bg-muted/30 space-y-2 border-t p-3', className)}>
        <p className="text-muted-foreground text-xs">{message}</p>
        {isError && onRetry ? (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
            다시 시도
          </Button>
        ) : null}
      </div>
    )
  }

  const participantCount = detail.teams.reduce((sum, team) => sum + team.participants.length, 0)
  const showInfusions = isCobaltGameMode(detail.gameMode)

  return (
    <div
      className={cn(
        'border-border/60 bg-muted/20 -mx-2 min-w-0 space-y-2 border-t px-1 py-2 sm:-mx-2 sm:px-1.5',
        className,
      )}
    >
      <p className="text-muted-foreground text-xs leading-none">
        경기 #{gameId} · 팀 {detail.teams.length} · 참가자 {participantCount}명
      </p>
      <div
        className={cn(MATCH_DETAIL_TABLE_CLASS, '@container/match-detail min-w-0')}
        data-show-infusions={showInfusions ? 'true' : 'false'}
      >
        <div className={cn(MATCH_DETAIL_TABLE_LAYOUT_CLASS, 'hidden @[760px]/match-detail:block')}>
          <MatchDetailParticipantHeader showInfusions={showInfusions} />
        </div>
        {detail.teams.map((team) => (
          <CompactMatchTeam
            key={team.teamNumber}
            team={team}
            showInfusions={showInfusions}
            displaySeasonId={detail.displaySeasonId}
          />
        ))}
      </div>
    </div>
  )
}
