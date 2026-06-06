import { Link } from 'react-router-dom'

import { SurfaceCard } from '@/components/shared'

export function NotFoundPage() {
  return (
    <SurfaceCard variant="muted" padding="lg" className="space-y-3">
      <h1 className="text-xl font-semibold">404</h1>
      <p className="text-muted-foreground text-sm">이 페이지는 존재하지 않습니다.</p>
      <Link className="text-primary inline-flex min-h-9 items-center text-sm underline-offset-4 hover:underline" to="/">
        홈으로
      </Link>
    </SurfaceCard>
  )
}
