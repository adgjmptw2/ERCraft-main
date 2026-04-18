# ERCraft

이터널 리턴 플레이어 통계·전적 검색 웹 앱(스터디).  
현재 **1~2일차** — 초기 뼈대와 폴더 구조 위주입니다.

---

## 1~2일차 초기 뼈대

### Day 1 — 프로젝트 셋업·구조

- Vite + React + TypeScript, Tailwind, shadcn/ui 초기화
- 경로 별칭 `@/` → `src/`
- `src/types` — `ApiResult`, 플레이어·매치·랭킹 타입
- React Router: `/`, `/player/:nickname`, `/ranking`, `/auth/callback`, 404
- `.env.example` / `.gitignore` / Prettier 등 기본 설정

### Day 2 — mock·API 스텁·첫 화면

- `src/mocks` — 타입에 맞는 mock 플레이어·매치·랭킹 데이터
- `src/api` — axios 클라이언트, `VITE_BSER_API_KEY` 없으면 mock 반환
- `src/hooks` — `useDebounce`, `usePlayerStats`, `useMatchHistory`(infinite)
- 홈: 디바운스 검색 → 프로필 링크 / 프로필: mock 기준 요약·최근 매치

---

## 폴더 구조

```
src/
├── api/              # axios 인스턴스 + 엔드포인트 함수
├── components/
│   ├── ui/           # shadcn/ui
│   ├── shared/       # StatusDot, TierBadge 등 공용 UI
│   └── player/       # MatchRow, ProfileCard 등 플레이어 UI
├── hooks/            # useDebounce, useMatchHistory, usePlayerStats 등
├── lib/              # shadcn 유틸 등
├── mocks/            # 타입 맞춘 mock 데이터
├── pages/            # 라우트별 페이지
├── store/            # Zustand 등 클라이언트 상태
├── types/            # player, match, ranking, api
└── utils/            # formatters, tierMap 등
```
