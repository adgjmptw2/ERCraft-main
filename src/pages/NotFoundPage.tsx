import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg p-6 text-left">
      <h1 className="text-xl font-semibold">404</h1>
      <p className="text-muted-foreground mt-2 text-sm">이 페이지는 존재하지 않습니다.</p>
      <Link className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline" to="/">
        홈으로
      </Link>
    </div>
  )
}
