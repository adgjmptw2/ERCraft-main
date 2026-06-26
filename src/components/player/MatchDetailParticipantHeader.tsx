import { cn } from '@/lib/utils'
import {
  MATCH_DETAIL_PARTICIPANT_COLS_CLASS,
  MATCH_DETAIL_TEAM_ROW_CLASS,
} from '@/components/player/matchDetailParticipantLayout'

export function MatchDetailParticipantHeader({
  showInfusions,
  className,
}: {
  showInfusions: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        MATCH_DETAIL_TEAM_ROW_CLASS,
        'text-muted-foreground border-border/40 border-b pb-1 text-[10px] leading-none font-medium',
        className,
      )}
      role="row"
    >
      <div className="px-1" role="columnheader">
        팀
      </div>
      <div className={cn(MATCH_DETAIL_PARTICIPANT_COLS_CLASS, 'px-0.5')} role="row">
        <div className="px-0.5" role="columnheader">
          플레이어
        </div>
        <div className="px-0.5 text-right tabular-nums" role="columnheader">
          KDA
        </div>
        <div className="px-0.5 text-right tabular-nums" role="columnheader">
          피해
        </div>
        <div className="match-detail-col-wild hidden px-0.5 text-right tabular-nums @[680px]/match-detail:block" role="columnheader">
          야생
        </div>
        <div className="match-detail-col-credit hidden px-0.5 text-right tabular-nums @[540px]/match-detail:block" role="columnheader">
          크레딧
        </div>
        <div className="px-0.5 text-center" role="columnheader">
          장비
        </div>
        {showInfusions ? (
          <div className="match-detail-col-infusion hidden px-0.5 @[760px]/match-detail:block" role="columnheader">
            인퓨전
          </div>
        ) : null}
      </div>
    </div>
  )
}
