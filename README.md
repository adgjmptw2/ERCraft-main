# ERCraft

이터널 리턴 플레이어 통계·전적 검색 웹 앱(스터디).

## 프로젝트 현재 상태

- 검색·프로필·즐겨찾기·검색 기록 — mock 데이터 기준으로 로컬 동작.
- 플레이어·매치 실연동 — BSER API 키 미발급, 스텁 상태.
- 배포 — `docs/DEPLOY.md`만 정리해 둔 상태.

---

## 지금까지

- **1~2일차:** 프론트 뼈대, mock, 홈·프로필
- **3일차:** 백엔드용 테이블·API 초안만 ([docs/DAY3.md](./docs/DAY3.md))
- **4일차:** mock을 JSON + loader로 ([docs/DAY4.md](./docs/DAY4.md))
- **5일차:** `ApiError`, DTO 변환, mock·API DTO 엔드포인트 ([docs/DAY5.md](./docs/DAY5.md))
- **6일차:** `backend/` Fastify·Prisma·MySQL, `X-User-Id` stub, 즐겨찾기·검색 기록 API ([docs/DAY6.md](./docs/DAY6.md))
- **7일차:** `EternalReturnClient` 인터페이스로 프론트 API 분리, 백엔드 body 파싱 zod 교체 ([docs/DAY7.md](./docs/DAY7.md))
- **8일차:** `getClient()` 캐시 제거, DTO 전용 hook, `getErrorMessage`, 프로필·홈 에러 처리 정리 ([docs/DAY8.md](./docs/DAY8.md))
- **9일차:** `TierBadge`·`SourceBadge`·`Skeleton`, `PlayerRow`·`MatchRow`, 홈·프로필 UI ([docs/DAY9.md](./docs/DAY9.md))
- **10일차:** 백엔드 zod 스키마 보강, 에러·404 응답 통일, `resolveStubUserId` 실패 처리, API 테스트 확장 ([docs/DAY10.md](./docs/DAY10.md))
- **11일차:** BSER proxy 방향, Contract 분리, `bserClient`·`bserMapper` 골격, BSER 문서 3개 ([docs/DAY11.md](./docs/DAY11.md))
- **12일차:** 백엔드 `config/env`, CORS, `GET /health`, `.env.example`·`DEPLOY.md`, 프론트에서 BSER 키 제거 ([docs/DAY12.md](./docs/DAY12.md))
- **13일차:** README 보완(현재 상태·설계·아키텍처·검증·트러블슈팅·스크린샷), `DECISIONS.md`, `KNOWN_ISSUE.md` ([docs/DAY13.md](./docs/DAY13.md))
- **14일차:** `typecheck` 스크립트, 빌드·테스트 재실행, mock 소폭 보정, `REAL_API_CHECKLIST.md`·`QA_CHECKLIST.md` ([docs/DAY14.md](./docs/DAY14.md))
- **계획:** API 키가 오는 대로 작업 재개 예정 현재 API키가 미뤄지는 중

---

## 현재 되는 것

- 홈에서 닉네임 부분 검색.
- 프로필에서 닉네임 단건 조회 + 요약·최근 매치.
- 즐겨찾기 추가·조회 (백엔드).
- 검색 기록 저장·조회 (백엔드, `limit` 1~50).
- 공통 에러 포맷 `{ error: { code, message, details? } }`.

플레이어·매치 실 API 연동은 없음. 프론트는 mock만 돌아감.

---

## 스택

| 영역 | |
|------|---|
| 프론트 | React 19, TypeScript(strict), Vite, Tailwind, shadcn/ui, TanStack Query, Zustand, React Router, axios |
| 백엔드 | Fastify 5, zod, `fastify-type-provider-zod` |
| DB | MySQL + Prisma |
| 테스트 | Vitest 2 (프론트 `loader`·`api`·`dto`, 백엔드 `app.inject()` HTTP) |

## 핵심 설계 포인트

### BSER API 키 보안

`BSER_API_KEY`는 백엔드 env에만. Vite 빌드는 `VITE_*`를 번들에 포함하기 때문에 프론트 env에 넣으면 결과물에서 바로 보임. 브라우저는 `VITE_API_BASE_URL` 기준으로 백엔드 proxy만 부르고, BSER 호출은 `backend/src/external/bserClient.ts`에서만.

### `EternalReturnClient` 인터페이스

플레이어·매치 접근을 인터페이스 하나로 고정. `VITE_API_BASE_URL` 유무로 `MockEternalReturnClient`(JSON loader)와 `RealEternalReturnClient`(백엔드 proxy, 아직 스텁)를 골라 끼움. 실 API 붙어도 페이지·hook는 그대로, 클라이언트 구현만 채우면 됨.

### 에러·성공 응답 통일

성공은 `ApiResult<T>` (`data`, `source`, `refreshedAt`), 에러는 프론트·백엔드 모두 `{ error: { code, message, details? } }`. 화면에서 에러 처리 분기가 하나로 줄어듦.

## 아키텍처

```
[브라우저]
│ VITE_API_BASE_URL
▼
[프론트 / React]
│ EternalReturnClient
│ ├─ Mock: loader.ts (JSON)
│ └─ Real: 백엔드 proxy 경유
▼
[백엔드 / Fastify]
│ authMiddleware (X-User-Id stub → JWT 예정)
│ routes: favorites, search-history
│ external: bserClient → BSER API (BSER_API_KEY)
▼
[MySQL / Prisma]
```

## 검증

- 프론트: Vitest 기반 API / mock / DTO 테스트.
- 백엔드: Fastify inject 기반 HTTP 레벨 테스트.
- 주요 범위: 검색, DTO 변환, 즐겨찾기, 검색 기록, 공통 에러 응답.

---

## mock 규칙

- `VITE_API_BASE_URL` 비어 있으면 → `MockEternalReturnClient`, `source: 'cache'`.
- 채우면 → `RealEternalReturnClient`, 메서드마다 `NOT_IMPLEMENTED` 던짐. 아직 스텁.
- 백엔드는 mock 분기 없이 MySQL에만 읽고 씀.

---

## 패키지 구조

```
.
├── src/          # 프론트 (Vite + React)
├── backend/      # 백엔드 (Fastify + Prisma + MySQL)
├── docs/         # DAY3~13, Postman, DEPLOY, DECISIONS, KNOWN_ISSUE
└── package.json  # 루트에서 프론트·백엔드 테스트까지 한 번에
```

**`src/`**

```
src/
├── api/
│   ├── client.ts         # axios 인스턴스
│   ├── erClient.ts       # EternalReturnClient 인터페이스 + getClient()
│   ├── erClient.mock.ts  # Mock 구현, loader 위임
│   ├── erClient.real.ts  # 백엔드 proxy 호출 예정, 현재 NOT_IMPLEMENTED 스텁
│   └── player.ts         # 공개 함수 6개, ApiResult 래핑은 여기서만
├── components/{ui, shared, player}
├── hooks/                # useDebounce, usePlayerStats, useMatchHistory
├── mocks/                # players.json, matches.json, loader.ts
├── pages/                # HomePage, ProfilePage 등
├── store/                # Zustand
├── types/                # player, match, ranking, api
└── utils/                # apiError, dto, tierMap, formatters
```

**`backend/`**

```
backend/
├── prisma/                 # schema.prisma + 초기 마이그레이션
└── src/
    ├── app.ts              # createApp() — Fastify + zod type provider
    ├── server.ts           # listen만
    ├── config/env.ts       # env 중앙 관리
    ├── schemas.ts          # zod 입력 스키마
    ├── middleware/auth.ts  # X-User-Id stub → users upsert
    ├── plugins/errorHandler.ts
    ├── routes/             # favorites, searchHistory
    ├── external/           # bserClient, bserMapper (skeleton)
    ├── contracts/          # 백엔드-프론트 shape 계약 타입
    └── utils/httpError.ts
```

---

## ERD (3일차 확정본)

외부 플레이어 ID는 `player_user_num`(숫자), 로그인 유저는 `users.id`(UUID).

**users**

| 컬럼 | 타입 | 메모 |
|------|------|------|
| id | UUID | PK |
| provider | varchar | `stub` / google / discord … |
| provider_sub | varchar | OAuth sub 또는 stub 헤더 값 |
| display_name, email | varchar, nullable | |
| created_at, updated_at | timestamp | |

UNIQUE `(provider, provider_sub)`

**favorite_players**

| 컬럼 | 타입 |
|------|------|
| id | bigserial PK |
| user_id | FK → users, cascade delete |
| player_user_num | bigint |
| nickname_snapshot | varchar |
| created_at | timestamp |

UNIQUE `(user_id, player_user_num)`, 인덱스 `(user_id, created_at DESC)`

**search_history**

| 컬럼 | 타입 |
|------|------|
| id | bigserial PK |
| user_id | FK → users |
| query | varchar |
| matched_user_num | bigint, nullable |
| created_at | timestamp |

인덱스 `(user_id, created_at DESC)`

`cached_player_stats` / `cached_match_history`는 BSER API 붙일 때 같이 깔 예정. 지금은 없음.

---

## 내부 API

성공은 `ApiResult<T> = { data, source: 'external'|'cache', refreshedAt }`, 에러는 `{ error: { code, message, details? } }`.

**프론트 (`src/api/player.ts`)**

| 함수 | 반환 | 비고 |
|------|------|------|
| `searchPlayers(nickname)` | `ApiResult<PlayerSummary[]>` | 2글자 미만은 빈 배열 |
| `fetchPlayerByNickname(nickname)` | `ApiResult<PlayerSummary \| null>` | 대소문자 무시 정확 일치 |
| `fetchPlayerStats(userNum)` | `ApiResult<PlayerStats>` | 없으면 `PLAYER_NOT_FOUND` |
| `fetchPlayerStatsDTO(userNum)` | `ApiResult<PlayerStatsDTO>` | 뷰 전용 가공 |
| `fetchMatchHistory(userNum, page)` | `ApiResult<Paginated<MatchSummary>>` | `pageSize` 10 고정 |
| `fetchMatchDTOHistory(userNum, page)` | `ApiResult<Paginated<MatchSummaryDTO>>` | 뷰 전용 가공 |

**백엔드**

| 메서드 | 경로 | 헤더 | 비고 |
|--------|------|------|------|
| POST | `/api/favorites` | `X-User-Id` | body `{ playerUserNum, nicknameSnapshot }`, 중복 시 409 `DUPLICATE_FAVORITE` |
| GET | `/api/favorites` | `X-User-Id` | `createdAt DESC` |
| POST | `/api/search-history` | `X-User-Id` | body `{ query, matchedUserNum? }`, 성공 시 204 |
| GET | `/api/search-history?limit=` | `X-User-Id` | 기본 20, 1~50으로 clamp |
| GET | `/health` | — | `{ status, timestamp }`, 인증 없음 |

`/api/players/*`는 BSER 실연동 때 같이 깔 예정.
에러 코드: `INVALID_REQUEST`(400), `UNAUTHORIZED`(401), `NOT_FOUND`(404), `DUPLICATE_FAVORITE`(409), `INTERNAL_ERROR`(500).

---

## 시작하기

**프론트**

```bash
npm install
cp .env.example .env.local    # VITE_API_BASE_URL 비우면 mock
npm run dev
npm run test:run              # 프론트 + 백엔드(TEST_DATABASE_URL 있을 때)
```

**백엔드**

```bash
cd backend
npm install
cp .env.example .env          # DATABASE_URL, TEST_DATABASE_URL, PORT, CORS_ORIGIN, BSER_API_KEY(선택)
npm run prisma:migrate
npm run dev                   # http://localhost:3001
npm run test
```

백엔드 수동으로 쳐 볼 거면 `docs/ERCraft.postman_collection.json` 임포트해서 사용.

## 트러블슈팅

**`dist/`가 git에 올라간다**
`.gitignore`에 `dist`가 있어야 한다. 이미 추적 중이면 `git rm -r --cached dist` 한 번 돌리고 커밋.

**테스트에서 `getClient()`가 env를 안 따른다**
모듈 레벨 캐시가 있으면 env 바꿔도 인스턴스가 재생성되지 않음. 매 호출마다 새 인스턴스를 만드는 방식으로 바꿨다.

**DTO `relativeTime` 테스트가 간헐적으로 깨진다**
"1일 전" 같은 상대 시각은 현재 시각 기준이라 타이밍에 따라 값이 달라짐. 테스트에선 고정 시각을 주입하거나 해당 필드를 검증하지 않는다.

**`VITE_*` env에 시크릿을 넣으면 번들에 박힌다**
Vite는 `VITE_*` 변수를 빌드 결과물에 그대로 포함. BSER 키는 백엔드 env에만 두고 브라우저로는 안 내려간다.

**zod 검증 실패가 Fastify 기본 JSON으로 나온다**
`hasZodFastifySchemaValidationErrors`로 잡아 `{ error: { code: 'INVALID_REQUEST', ... } }` 형태로 통일했다.

---

추후 BSER 플레이어 API 연동 예정 (`RealEternalReturnClient` 구현, `source: 'external'` 전환).

## 스크린샷

> 준비 중. `docs/screenshots/` 에 추가 예정.
