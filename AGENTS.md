# ERCraft — Project Context

## What is ERCraft?
Player statistics and match history platform for Eternal Return.
Focused on clean data presentation and MMR prediction tooling.

## Stack
- React + TypeScript (strict)
- Vite
- Zustand — client UI state
- TanStack Query — server/async state
- TailwindCSS + shadcn/ui
- react-window — list virtualization
- Axios + React Router v6

All packages installed at latest stable version. Do not pin specific versions.

## Folder Structure
```
src/
├── api/          # axios client + endpoint functions
├── components/
│   ├── ui/       # shadcn/ui — do not edit
│   ├── shared/   # StatusDot, TierBadge, LazyImg, Skeleton
│   └── player/   # MatchRow, MatchFeed, ProfileCard
├── hooks/        # useDebounce, useMatchHistory, usePlayerStats
├── mocks/        # typed mock data, no MSW
├── store/        # useSessionStore, useSearchStore
├── types/        # player.ts, match.ts, ranking.ts, api.ts
└── utils/        # formatters, tierMap, characterMap
```

## Core Rules
- No `any` — use `unknown` + type guard
- No axios calls in components — only through `src/api/`
- No `useState` for server data — TanStack Query only
- Lists over 50 items → react-window
- Every async state needs Skeleton (loading) + error handling
- No inline styles — Tailwind classes only
- Don't touch `src/components/ui/`

## API Response Shape
```ts
interface ApiResult<T> {
  data: T
  source: 'external' | 'cache'
  refreshedAt: string
}
```

## Tier System (ER ladder)

아이언 4~1 → 브론즈 4~1 → 실버 4~1 → 골드 4~1 → 플래티넘 4~1 → 다이아몬드 4~1 → 메테오라이트 4~1 → 미스릴 → 데미갓 → 이터니티

(아이언·브론즈·실버·골드·플래티넘·다이아·메테오라이트는 각 티어 내 4단계.)

## 3일차 확정 스펙

- `ApiResult<T>` — `data`, `source` (`'external' | 'cache'`), `refreshedAt`
- 에러 형태 — `{ error: { code, message, details? } }`
- `matches` 응답 — `Paginated<MatchSummary>` (`page`, `pageSize`, `hasNext`)

## Mock Rule
When `VITE_API_BASE_URL` is empty/unset → use mock JSON with `source: 'cache'`.
Mock 파일 맨 위에 짧게 표시 (예시):
`// MOCK — 실 API 붙기 전`

## Backend (`backend/`)

- Fastify + Prisma + MySQL. 앱 조립은 `createApp()`, listen은 `server.ts`만.
- 스키마는 zod (`fastify-type-provider-zod`) — `src/schemas.ts`에 모아둠.
- BSER 프록시: `routes/players.ts` → `external/bserClient.ts`(Open API v11, uid 기반) + `external/bserMapper.ts`.
  - `GET /api/players/search?q=` · `GET /api/players/:nickname/summary|stats|matches`
  - `BSER_API_KEY` 없으면 503 UPSTREAM_ERROR. uid는 외부 비노출(닉네임 키 + in-memory 캐시).
- 프론트 클라이언트 인터페이스(`src/api/erClient.ts`)도 닉네임 키 기준 — BSER v11에서 userNum 조회 폐지됨.

## Env Vars
```
VITE_API_BASE_URL=
```
(BSER 키는 `backend/.env`의 `BSER_API_KEY`만 — 프론트 `VITE_*`에 넣지 않음.)
