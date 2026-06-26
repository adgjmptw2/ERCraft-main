import { Link, useParams } from 'react-router-dom'

import { MatchDetailPanel } from '@/components/match/MatchDetailPanel'
import { EmptyState } from '@/components/shared'
import { getDemoMatchDetail } from '@/mocks/loader'

export function MatchDetailPage() {
  const { matchId = '' } = useParams()
  const detail = matchId ? getDemoMatchDetail(matchId) : null

  if (!matchId.trim()) {
    return (
      <EmptyState
        title="매치 ID가 없습니다"
        action={
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
            홈으로
          </Link>
        }
      />
    )
  }

  if (!detail) {
    return (
      <EmptyState
        title="매치를 찾을 수 없습니다"
        description="데모 데이터에 없는 matchId입니다."
        action={
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/">
            홈으로
          </Link>
        }
      />
    )
  }

  return <MatchDetailPanel detail={detail} />
}
