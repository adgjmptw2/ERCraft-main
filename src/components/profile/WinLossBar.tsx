import { cn } from '@/lib/utils'

export interface WinLossBarProps {
  wins: number
  losses: number
  winRate: number
  className?: string
}

export function WinLossBar({ wins, losses, winRate, className }: WinLossBarProps) {
  const total = wins + losses
  const winPct = total > 0 ? (wins / total) * 100 : 50
  const lossPct = total > 0 ? 100 - winPct : 50

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-panel-heading text-left text-2xl font-extrabold tabular-nums">
        {winRate.toFixed(0)}%
      </p>
      <div className="text-muted-foreground flex items-center justify-between text-xs font-medium tabular-nums">
        <span className="text-green-600 dark:text-[#22c55e]">
          승리 {wins}승
        </span>
        <span>
          패배 {losses}패
        </span>
      </div>
      <div className="bg-border h-1.5 overflow-hidden rounded-full dark:bg-[#2a2a2a]">
        <div className="flex h-full">
          <div style={{ width: `${winPct}%`, backgroundColor: '#22c55e' }} />
          <div style={{ width: `${lossPct}%`, backgroundColor: '#6b7280' }} />
        </div>
      </div>
    </div>
  )
}
