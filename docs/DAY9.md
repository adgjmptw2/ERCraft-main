# 9일차 — 돌아보기

---

**공용 UI (`shared/`).** `TierBadge`는 티어 문자열 첫 토큰(공백 기준)을 소문자로 맞춰 Iron/Bronze·Silver/Gold·Platinum/Diamond·Meteorite/Mithril·Demigod/Eternity 그룹별로 색만 다르게. `SourceBadge`는 `cache` → "캐시" 회색, `external` → "실시간" 파란 계열. `Skeleton` / `SkeletonText` / `SkeletonCard`는 `animate-pulse` + `bg-muted`. `index.ts`에서 export.

**플레이어 UI (`player/`).** `PlayerRow`는 `PlayerSummary`로 닉 + `TierBadge` + "프로필 보기" 링크. `MatchRow`는 `MatchSummaryDTO`로 캐릭터·placementLabel·kdaString·relativeTime, 승리면 왼쪽 초록 border + 연한 배경. `index.ts`에서 export.

**HomePage.** debounce·query 로직 그대로, 문구·로딩 스켈레톤·`PlayerRow`·`data.source` 있으면 목록 위 `SourceBadge`만 UI 교체.

**ProfilePage.** query·우선순위 그대로, summary 로딩은 텍스트 대신 스켈레톤. 통계는 카드 grid + `statsQuery.data.source` 뱃지, 전적은 `MatchRow` + 첫 페이지 `source` 뱃지 + `hasNextPage`일 때 "더 보기"로 `fetchNextPage()`.

**기타 페이지.** `NotFoundPage` / `RankingPage` / `AuthCallbackPage` 

추가 shadcn 컴포넌트 쓰려면 예: `npx shadcn@latest add card` (border 카드로 처리, 설치는 X)
