# 6일차 — 돌아보기

---

같은 레포에 **`backend/`** 폴더만 새로 깜. 프론트 `src/`는 안 건드림.

**스택:** Fastify + Prisma + MySQL. 이유는 한 줄로 말하면, 라우트·플러그인 구조가 단순하고 Prisma로 3일차에 잡아 둔 스키마를 그대로 옮기기 좋아서.

`createApp()`은 **`src/app.ts`**, 실제 listen은 **`src/server.ts`**만 씀. Vitest는 `createApp({ prisma })` + `inject`로 HTTP만 검증.

**Prisma:** `users` / `favorite_players` / `search_history`를 3일차 의미 그대로 MySQL에 맞춤. UUID PK는 `Char(36)`, `bigserial`류는 `Int @default(autoincrement())`, `player_user_num`·`matched_user_num`은 `BigInt`. `(user_id, created_at DESC)` 인덱스는 Prisma `sort: Desc`로 맞춤. 초기 마이그레이션 SQL은 `prisma migrate diff`로 뽑아서 `prisma/migrations/...`에 넣음.

**인증:** **`middleware/auth.ts`**에서 `X-User-Id` 없으면 401 + `{ error: { code: 'UNAUTHORIZED', ... } }`. 있으면 `provider='stub'`, `provider_sub=헤더 값`으로 **users upsert**. FK는 `users.id`(UUID)라서 라우트에서는 `resolveStubUserId`로 한 번 더 조회해서 씀. 나중에 JWT 붙일 때 이 파일만 갈아끼우면 됨.

**API:** `POST/GET /api/favorites`, `POST/GET /api/search-history`. 성공 응답은 프론트랑 같은 **`ApiResult<T>`** 모양(`source`는 일단 `external`). 중복 즐겨찾기 409 `DUPLICATE_FAVORITE`, 바디 깨짐/필드 오류 400 `INVALID_REQUEST`. 검색 기록 POST는 **204** 바디 없음. GET `limit` 기본 20, 1~50으로 clamp.

**에러:** 전부 **`{ error: { code, message, details? } }`**. 404는 `setNotFoundHandler`, Prisma 예외는 500으로만 메시지 고정(내용 노출 안 함).

**테스트:** `TEST_DATABASE_URL` 없으면 **describe.skipIf**로 통째로 스킵. 있으면 `migrate deploy` 한 번 돌린 뒤 `user.deleteMany()`로 비우고 케이스별 검증. SQLite는 안 씀.

`backend`에서 `npm i`, `.env`에 DB URL 넣고 `npm run prisma:migrate`, `npm run dev` / `npm run test` 순으로 보면 됨.
