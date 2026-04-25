# ERCraft

이터널 리턴 플레이어 통계·전적 검색 웹 앱(스터디).

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

---

## 현재 되는 것

- 홈에서 닉네임 부분 검색
- 프로필에서 닉네임 단건 조회 + 요약·최근 매치
- 즐겨찾기 추가·조회 (백엔드)
- 검색 기록 저장·조회 (백엔드, `limit` 1~50)
- 공통 에러 포맷 `{ error: { code, message, details? } }`

플레이어·매치 쪽 실 API 연동은 아직 없음. 프론트는 mock만 돌아감.

---

## 스택

| 영역 | |
|------|---|
| 프론트 | React 19, TypeScript(strict), Vite, Tailwind, shadcn/ui, TanStack Query, Zustand, React Router, axios |
| 백엔드 | Fastify 5, zod, `fastify-type-provider-zod` |
| DB | MySQL + Prisma |
| 테스트 | Vitest 2 (프론트 `loader`·`api`·`dto`, 백엔드 `app.inject()` HTTP) |

---

## mock 규칙

프론트는 `VITE_BSER_API_KEY` 값이 없으면 `MockEternalReturnClient`로 실행되고, 응답 `source`가 `cache`로 내려옴.
키가 있으면 `RealEternalReturnClient`가 뽑히지만 메서드는 전부 `throwApiError('NOT_IMPLEMENTED', ...)`만 던짐.
백엔드는 mock 분기 없이 실제 MySQL에 읽고 씀.

---

## 패키지 구조

```
.
├── src/          # 프론트 (Vite + React)
├── backend/      # 백엔드 (Fastify + Prisma + MySQL)
├── docs/         # DAY3~7 설계·회고, Postman collection
└── package.json  # 루트에서 프론트·백엔드 테스트까지 한 번에
```

**`src/`**

```
src/
├── api/
│   ├── client.ts         # axios 인스턴스
│   ├── erClient.ts       # EternalReturnClient 인터페이스 + getClient()
│   ├── erClient.mock.ts  # Mock 구현, loader 위임
│   ├── erClient.real.ts  # Real 구현 — 전부 NOT_IMPLEMENTED 스텁
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
    ├── schemas.ts          # zod 입력 스키마
    ├── middleware/auth.ts  # X-User-Id stub → users upsert
    ├── plugins/errorHandler.ts
    ├── routes/             # favorites, searchHistory
    ├── types/
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

3일차에 초안으로 잡아 둔 `cached_player_stats` / `cached_match_history`는 실 BSER API 붙일 때 같이 깔 예정. 지금은 없음.

---

## 내부 API

성공 응답 전부 `ApiResult<T> = { data, source: 'external'|'cache', refreshedAt }`,
에러는 전부 `{ error: { code, message, details? } }`.

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

`/api/players/*`는 실 API 붙일 때 같이 깔 예정.
에러 코드: `INVALID_REQUEST`(400), `UNAUTHORIZED`(401), `NOT_FOUND`(404), `DUPLICATE_FAVORITE`(409), `INTERNAL_ERROR`(500).

---

## 시작하기

**프론트**

```bash
npm install
cp .env.example .env.local    # 비워 두면 mock
npm run dev
npm run test:run              # 프론트 + 백엔드(TEST_DATABASE_URL 있을 때)
```

**백엔드**

```bash
cd backend
npm install
cp .env.example .env          # DATABASE_URL, TEST_DATABASE_URL, PORT
npm run prisma:migrate
npm run dev                   # http://localhost:3001
npm run test
```

수동으로 백엔드 쳐 볼 거면 `docs/ERCraft.postman_collection.json` 임포트해서 사용

---

추후 실제 BSER 플레이어 API 연동 예정 (`RealEternalReturnClient` 구현, `source: 'external'` 전환).
