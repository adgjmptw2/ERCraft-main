# ERCraft API — 로컬 개발

## 백엔드 실행

```bash
cd backend
cp .env.example .env
# BSER_API_KEY 설정
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

`seasonStatsCache` / `playerSeasonsCache` DB 캐시를 쓰려면 **마이그레이션 + `prisma generate`가 필수**입니다.  
delegate가 없으면 개발 모드에서 `[ercraft] DB cache disabled` 경고가 한 번 출력되고, 메모리 캐시만 사용됩니다.

## 플레이어 프록시 (`/api/players/*`)

| Route | 설명 | BSER 호출 (대략) |
|-------|------|------------------|
| `GET /players/search?q=` | 정확 닉 검색 | nickname + rank (+ season 메타) |
| `GET /players/:nickname/summary` | 프로필 요약 | nickname + rank |
| `GET /players/:nickname/stats` | 현재 시즌 통계 | stats (+ rank) |
| `GET /players/:nickname/matches` | 최근 경기 | games (여기서만) |
| `GET /players/:nickname/seasons?from=&to=` | 시즌 그리드 | 범위 내 시즌별 stats/rank |

- `seasons`의 `from`/`to`를 생략하면 **현재 시즌만** 조회합니다.
- 개발 모드에서 각 route는 `player route` 로그로 `durationMs`, `bserRequestCount`를 남깁니다.

## 프론트

```bash
# 루트
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3001
npm run dev
```

프로필 최초 진입: `summary` → `stats` / `matches` 첫 페이지 / 현재 시즌만 `seasons`.  
캐릭터 통계·RP 차트는 **로드된 matches만** 사용. 추가 페이지는 **「추가 경기 불러오기」** 클릭 시에만 (1회당 최대 2페이지).

## 에러 코드 (프론트 메시지)

| code | 사용자 메시지 |
|------|----------------|
| `UPSTREAM_TIMEOUT` | 공식 API 응답이 지연… |
| `RATE_LIMITED` | 공식 API 요청 제한… |
| `UPSTREAM_ERROR` (503) | 공식 API 연결 확인… |
| (네트워크 없음) | 백엔드 서버에 연결하지 못했습니다… |
