# 10일차 — 돌아보기

---

**schemas.** `playerUserNum`은 `z.number().int().positive()`, `nicknameSnapshot`은 `trim().min(1).max(50)`, `matchedUserNum`은 `z.number().int().positive().optional().nullable()` 순서 유지. `limit` 쿼리는 그대로 `positive().optional()`.

**errorHandler.** `HttpError` 분기는 그대로. zod/Fastify validation은 `hasZodFastifySchemaValidationErrors`로 잡아 `INVALID_REQUEST` + `details.fields`에 path·메시지 요약만(배열 상한 30). Prisma·serialize·그 외 미처리 예외는 `INTERNAL_ERROR` / `Internal server error`로만 응답하고, 내용은 `server.log.error`에만 남김.

**404.** `setNotFoundHandler`는 `createApp`에서 라우트 등록 전에 걸고, `{ error: { code: 'NOT_FOUND', message: 'Route not found' } }`. 플러그인 쪽 not found는 제거

**auth.** 공백-only `X-User-Id`는 기존 trim 검사로 401. `resolveStubUserId`에서 `findUniqueOrThrow`가 P2025면 `HttpError(500, 'INTERNAL_ERROR', 'User resolution failed')`.

**favorites.** zod만으로 공백 닉네임·GET 0건·userId 스코프는 기존 동작 그대로 확인만.

