# QA 체크리스트

## 자동 (테스트/빌드로 확인)

- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] `npm run test:run` 전체 통과 (또는 `npm run test` — watch이면 `vitest run`으로 일회 실행)
- [ ] `cd backend && npm run typecheck` 통과
- [ ] `cd backend && npm run test` 통과 (또는 `describe.skipIf(!hasTestDb)`로 적절히 스킵)

## 백엔드 (curl로 확인 가능)

- [ ] `GET /health` → `{ status: 'ok' }` (또는 문서에 맞는 스키마)
- [ ] `X-User-Id` 없이 `POST /api/favorites` → 401
- [ ] 즐겨찾기 중복 → 409
- [ ] validation 실패 → 400 + `INVALID_REQUEST`
- [ ] 없는 라우트 → 404 + `NOT_FOUND`

## 프론트 (브라우저 수동 확인)

- [ ] 홈 화면 로드
- [ ] 닉네임 검색 (2자 이상)
- [ ] 검색 결과 클릭 → 프로필 페이지
- [ ] 프로필: 통계 섹션 표시
- [ ] 프로필: 전적 섹션 표시
- [ ] 프로필: 더 보기 버튼 동작
- [ ] 없는 닉네임 → "플레이어를 찾을 수 없습니다"
- [ ] 로딩 중 skeleton 표시
- [ ] 에러 상태 메시지 표시

## 보안

- [ ] 브라우저 devtools Network 탭에서 `BSER_API_KEY` 노출 없는지
- [ ] `.env` 파일 git에 없는지 (`git ls-files`에 `.env` · `.env.local` 미포함)
- [ ] `dist/` git에 없는지
- [ ] `VITE_BSER_API_KEY` 코드/문서에 남아있지 않은지

## 문서

- [ ] README의 현재 상태가 실제 구현과 일치
- [ ] README에 깨진 스크린샷 링크 없음
- [ ] `DEPLOY.md` env 설명과 `.env.example` 일치
- [ ] `KNOWN_ISSUE.md`가 현재 상태와 일치
