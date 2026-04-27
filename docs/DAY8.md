# 8일차 — 돌아보기

---

**`getClient()` 캐시 제거.** `erClient.ts`에서 모듈 레벨 `cached`를 없애고, 호출마다 `MockEternalReturnClient` / `RealEternalReturnClient`를 새로 만든다. 테스트에서 env 바꿔도 클라이언트가 따라감.

**DTO 전용 hook 두 개.** `usePlayerStatsDTO`는 `fetchPlayerStatsDTO` + `queryKey: ['player', 'stats-dto', userNum]`, `enabled: userNum > 0`. `useMatchDTOHistory`는 `fetchMatchDTOHistory` + `useInfiniteQuery`, `queryKey: ['player', 'matches-dto', userNum]`, `initialPageParam: 0`, `getNextPageParam`은 `hasNext`가 false면 undefined, 아니면 `page + 1`. 기존 `usePlayerStats` / `useMatchHistory`는 손대지 않음.

**에러 문구.** `src/utils/errorMessage.ts`에 `getErrorMessage(error, fallback)` — `ApiError`·`Error`면 `message`, 아니면 `fallback`.

**ProfilePage.** summary는 `fetchPlayerByNickname`만 `useQuery` (`queryKey: ['player', 'summary', nickname]`, `enabled: nickname.length > 0`). 통계·전적은 `usePlayerStatsDTO` / `useMatchDTOHistory`, 전적 목록은 `pages.flatMap((p) => p.data.items)`. 로딩·에러·없음은 summary 먼저, 그다음 섹션별로 독립. 로컬 `formatWinRate` 류는 빼고 DTO 필드만 씀.

**HomePage.** 검색 에러만 `getErrorMessage(error, '검색에 실패했습니다')`로 통일.
