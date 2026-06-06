import { Link, NavLink, Outlet } from 'react-router-dom'

import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-9 items-center rounded-lg px-2.5 text-sm font-medium transition-colors sm:px-3',
    isActive
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  )

export function AppShell() {
  return (
    <div className="app-shell-bg flex min-h-svh flex-col">
      <header className="border-border/70 bg-background/85 sticky top-0 z-50 border-b backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="min-w-0 space-y-0.5">
            <p className="text-foreground text-sm font-semibold tracking-tight">ERCraft</p>
            <p className="text-muted-foreground hidden text-xs sm:block">이터널리턴 플레이 리포트</p>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-1.5" aria-label="주요 메뉴">
            <NavLink to="/" end className={navLinkClass}>
              홈
            </NavLink>
            <NavLink to="/ranking" className={navLinkClass}>
              랭킹
            </NavLink>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
