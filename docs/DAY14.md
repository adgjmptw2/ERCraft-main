# 14일차 — 점검·정리

---

**typecheck·build.** 루트 `package.json`에 `"typecheck": "tsc -b --noEmit"` 추가 (프로젝트 레퍼런스 구조; 단일 `tsc --noEmit`은 루트 `tsconfig`에서 실패). 백엔드에 `"typecheck": "tsc --noEmit"` 추가. `npm run typecheck`·`npm run build`(루트)·백엔드 동일 — 통과.

**테스트.** `npm run test:run`(루트, 백엔드 테스트 포함)·`cd backend && npm run test` 재실행 — 전부 통과.

**git·비밀.** `dist/`·`backend/dist/`는 tracked 아님. `.env`는 tracked 아님; `.env.example`·`backend/.env.example`만 추적. 워크스페이스 전체에서 `VITE_BSER_API_KEY` 문자열 제거(`CLAUDE.md` mock 규칙·env, `docs/DAY12.md` 한 줄).

**mock.** `matches.json` — 4월 초 날짜 두 건을 최근 2주 안으로 이동. `네온샤워`(674015) 전적 2판만 있어 샘플이 얇았던 부분에 판 2건 추가(총 20매치). 티어·MMR·다른 유저 판수는 기존 테스트 기대와 충돌 없음.

**문서.** `docs/REAL_API_CHECKLIST.md`, `docs/QA_CHECKLIST.md` 추가. QA는 자동/수동·curl 구분; 브라우저 확인은 미실행으로 체크박스 비움.

**경고.** 루트 `tsconfig.json`의 `baseUrl` deprecation은 `tsc -b` 경로에서는 재현되지 않음. 빌드 콘솔 경고 없음. Vitest 실행 시 Prisma “Update available” 안내만 출력(선택 업그레이드).

**아직.** 브라우저 QA·curl 스모크는 이 환경에서 실행하지 않음 — `QA_CHECKLIST.md` 해당 항목 미체크 유지. README·`DEPLOY.md`·`KNOWN_ISSUE.md`와 구현 문장 단위 대조는 하지 않음.

**회고.** mock·Contract·백엔드 골격까지 맞추면서 실 API 한 번 붙이면 끝나는 구조가 보인다. 키 없이도 돌아가게 두는 데 시간을 쓴 만큼, 연동 시에는 `BSER_API_MAPPING.md`의 “확인 필요”를 줄이는 게 첫 병목이 될 듯

**API 키 오면:** `backend/src/external/bserClient.ts`·`bserMapper.ts` 채우고 `REAL_API_CHECKLIST.md` 순으로 호출·에러·시즌 ID부터 고정
