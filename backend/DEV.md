# Backend local dev notes

## Prisma migrate / generate (Windows)

When `npx prisma generate` fails with **EPERM** on `query_engine-windows.dll.node`, a running Node process (usually `tsx watch` dev server) is locking the Prisma client DLL.

**Recommended order:**

1. Stop backend dev server (`Ctrl+C` or kill the `tsx watch src/server.ts` process).
2. Optionally stop other Node processes that load `@prisma/client` (smoke scripts, tests).
3. `npx prisma migrate deploy`
4. `npx prisma generate`
5. Restart backend: `npm run dev`
6. Restart frontend if it was stopped (`npm run dev` in repo root).

**Do not** run production cleanup, truncate, or drop on shared databases.

## Live smoke (39.9C)

Backend must be running with `BSER_API_KEY` and `DATABASE_URL` set.

```bash
cd backend
npm run build                    # rank-tier smoke needs dist/
npm run smoke:rank-tier
npm run smoke:profile fencing
npm run smoke:profile-cache -- fencing
npm run smoke:profile-cache -- 절단마술사
```

`SMOKE_WAIT_MS` (default 8000) controls how long to wait for background backfill between aggregate calls.

## 캐릭터 통계 표시 기준 (39.9C 고정)

분석 탭 전제 조건 — 프로필 캐릭터 통계/분석 v1:

1. **official stats.characterStats가 있으면 즉시 표시** (aggregate/backfill 대기 없음).
2. **partial aggregate가 official보다 빈약하면 덮어쓰지 않음** — row 수 유지.
3. **aggregate cacheStatus=ready** 이고 aggregate가 더 풍부하면 aggregate 보강.
4. **backfill running 중**에도 분석 탭 렌더 가능 (공식 stats 기준).
5. basis 라벨: 공식 stats → `시즌 집계 기준`, 집계 대기 중 stats 없음 → `시즌 집계 중`.
