# 백엔드 Proxy 설계

---

## 왜 프론트에서 BSER API를 직접 호출하지 않는가

- **키 노출:** `VITE_*` 환경변수는 빌드 결과물에 포함된다. BSER API key를 프론트에 두면 누구나 브라우저 소스에서 꺼낼 수 있다.
- **CORS:** BSER API가 브라우저 직접 요청을 허용하는지 확인되지 않았다.
- **중앙 에러 처리:** rate limit(429), 서버 오류(502) 등을 백엔드 한 곳에서 변환하고, 프론트에는 일관된 `{ error: { code, message } }` 형태로만 내려 준다.

---

## 흐름

```
프론트 RealEternalReturnClient
  ↓  (VITE_API_BASE_URL 기준 axios)
백엔드 /api/players/*
  ↓
backend/src/external/bserClient.ts
  ↓  (BSER_API_KEY, https://open-api.bser.io)
BSER API
  ↓
bserMapper.ts  →  Contract 타입
  ↓
프론트 응답 (ApiResult<ContractType>)
```

---

## 각 레이어 책임

| 레이어 | 파일 | 책임 |
|--------|------|------|
| 프론트 클라이언트 | `src/api/erClient.real.ts` | 백엔드 proxy 호출, `ApiResult<T>` 언래핑 |
| 백엔드 라우트 | `backend/src/routes/players/*` (미구현) | 인증, 요청 검증, BserClient 호출, 응답 포맷 |
| BSER 클라이언트 | `backend/src/external/bserClient.ts` | BSER API HTTP 호출. key는 이 파일에서만 |
| 응답 변환 | `backend/src/external/bserMapper.ts` | BSER 원본 → Contract 타입 |
| 계약 타입 | `backend/src/contracts/player.ts` | 백엔드-프론트 간 shape 계약. 프론트 `src/types`와 동일 shape 유지 |

---

## 에러 흐름

```
BSER API 429 (rate limit)
  → bserClient에서 HttpError(429, 'RATE_LIMITED', ...) throw
  → errorHandler가 { error: { code: 'RATE_LIMITED', message: ... } } 반환

BSER API 404 (유저 없음)
  → bserClient에서 HttpError(404, 'PLAYER_NOT_FOUND', ...) throw
  → errorHandler가 { error: { code: 'PLAYER_NOT_FOUND', ... } } 반환

BSER API 502 / 타임아웃
  → bserClient에서 HttpError(502, 'UPSTREAM_ERROR', ...) throw
  → errorHandler가 { error: { code: 'UPSTREAM_ERROR', ... } } 반환
```

---

## 미확정 사항

- `fetchPlayerByUserNum`에 대응하는 BSER 엔드포인트 미확인. 공식 문서 확인 전까지 라우트 구현 금지.
- `fetchPlayerStats`의 `seasonId` 결정 방식 미확정. 인터페이스 변경 없이 백엔드 내부에서 결정하는 방향으로 진행 예정.
- `characterName`이 BSER에서 ID로 오는 경우 character 매핑 테이블 필요 여부 — 확인 후 결정.
- 백엔드 proxy 라우트(`/api/players/*`)는 실제 API key 발급 후 구현.
