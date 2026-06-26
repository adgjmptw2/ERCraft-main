import { cn } from '@/lib/utils'

export type ProfileTabId = 'records' | 'analysis'

export interface ProfileTabNavProps {
  activeTab: ProfileTabId
  onTabChange: (tab: ProfileTabId) => void
  className?: string
}

const TABS: { id: ProfileTabId; label: string }[] = [
  { id: 'records', label: '전적' },
  { id: 'analysis', label: '분석' },
]

export function ProfileTabNav({ activeTab, onTabChange, className }: ProfileTabNavProps) {
  return (
    <nav
      className={cn('border-border/70 border-b', className)}
      aria-label="프로필 탭"
    >
      <div className="flex gap-6">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'text-muted-foreground hover:text-foreground -mb-px border-b-2 px-1 py-3 text-sm font-semibold transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
