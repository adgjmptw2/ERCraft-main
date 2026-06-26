import {
  CompactMatchParticipant,
  CompactMatchParticipantMobile,
} from '@/components/player/CompactMatchParticipant'
import {
  MATCH_DETAIL_COMPACT_LAYOUT_CLASS,
  MATCH_DETAIL_TABLE_LAYOUT_CLASS,
  MATCH_DETAIL_TEAM_BLOCK_CLASS,
  MATCH_DETAIL_TEAM_ROW_CLASS,
} from '@/components/player/matchDetailParticipantLayout'
import { cn } from '@/lib/utils'
import type { MatchDetailTeam } from '@/types/matchDetail'

export interface CompactMatchTeamProps {
  team: MatchDetailTeam
  showInfusions: boolean
  displaySeasonId?: number | null
}

export function CompactMatchTeam({ team, showInfusions, displaySeasonId }: CompactMatchTeamProps) {
  return (
    <section className="border-border/40 border-b last:border-b-0" aria-label={`팀 ${team.teamNumber}`}>
      <div className={cn(MATCH_DETAIL_COMPACT_LAYOUT_CLASS, 'block @[760px]/match-detail:hidden')}>
        <h4 className="text-muted-foreground px-1 py-0.5 text-[10px] font-semibold leading-none">
          팀 {team.teamNumber} · #{team.teamRank}
        </h4>
        {team.participants.map((participant) => (
          <CompactMatchParticipantMobile
            key={participant.participantId}
            participant={participant}
            showInfusions={showInfusions}
            displaySeasonId={displaySeasonId}
          />
        ))}
      </div>

      <div className={cn(MATCH_DETAIL_TABLE_LAYOUT_CLASS, MATCH_DETAIL_TEAM_BLOCK_CLASS, 'hidden @[760px]/match-detail:block')}>
        <div className={cn(MATCH_DETAIL_TEAM_ROW_CLASS, 'items-stretch')}>
          <div
            className="border-border/30 bg-muted/10 text-muted-foreground flex flex-col items-center justify-center border-r px-1 py-2 text-center text-[10px] leading-tight"
            role="rowheader"
          >
            <span className="text-foreground font-bold tabular-nums">#{team.teamRank}</span>
            <span>팀{team.teamNumber}</span>
          </div>
          <div className="min-w-0">
            {team.participants.map((participant) => (
              <CompactMatchParticipant
                key={participant.participantId}
                participant={participant}
                showInfusions={showInfusions}
                displaySeasonId={displaySeasonId}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
