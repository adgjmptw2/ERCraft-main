# 12일차 — 돌아보기

---

**env.** 백엔드는 **`src/config/env.ts`**에서만 읽게 모았다. `BSER_API_KEY`는 빈 문자열 허용. `DATABASE_URL`은 **`server.ts`**에서 listen 직전에만 없으면 throw

**CORS.** `@fastify/cors`로 `CORS_ORIGIN`을 쉼표 분리해서 `origin` 배열로 넘김. inject 테스트는 그대로

**헬스.** **`GET /health`** — `{ status: 'ok', timestamp }` 만. DB ping 없음

**예시 env.** 루트·`backend/` **`.env.example`만** 손봤다. `VITE_BSER_API_KEY`는 프론트에서 뺐고, 프론트 mock/real 분기는 **`VITE_API_BASE_URL`** 유무

**문서.** **`docs/DEPLOY.md`** — Vercel·Railway 쪽 순서랑 보안 체크만 짧게
