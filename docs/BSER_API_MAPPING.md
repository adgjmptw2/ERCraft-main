# BSER API 매핑

> 베이스: `https://open-api.bser.io`
>
> 내부 API(프론트 → 백엔드)는 `/api/players/*`.
> BSER API(백엔드 → 외부)는 `bserClient.ts`에서만 호출.

---

## 메서드별 매핑

### `searchPlayers(nickname)`

| 구분 | 내용 |
|------|------|
| 프론트 → 백엔드 | `GET /api/players/search?nickname={nickname}` |
| 백엔드 → BSER | `GET /v1/user/nickname?nickname={nickname}` |
| BSER 응답 → Contract | `mapToPlayerSummary` |

**BSER 응답 예상 필드:** 확인 필요. `userNum`, `nickname` 포함 예상이나 `level`, `tier` 포함 여부 미확인.

---

### `fetchPlayerByNickname(nickname)`

| 구분 | 내용 |
|------|------|
| 프론트 → 백엔드 | `GET /api/players/{nickname}` |
| 백엔드 → BSER | `GET /v1/user/nickname?nickname={nickname}` |
| BSER 응답 → Contract | `mapToPlayerSummary` |

**주의:** `searchPlayers`와 동일 엔드포인트를 쓸 가능성 있음. 닉네임 정확 일치 vs 부분 일치 처리를 백엔드에서 구분해야 함.

---

### `fetchPlayerByUserNum(userNum)`

| 구분 | 내용 |
|------|------|
| 프론트 → 백엔드 | `GET /api/players/by-user/{userNum}` |
| 백엔드 → BSER | **확인 필요** |
| BSER 응답 → Contract | `mapToPlayerSummary` |

> **확인 필요:** userNum으로 유저 요약을 직접 조회하는 BSER 엔드포인트 미확인. 공식 문서 확인 전까지 구현 금지.

---

### `fetchPlayerStats(userNum)`

| 구분 | 내용 |
|------|------|
| 프론트 → 백엔드 | `GET /api/players/{userNum}/stats` |
| 백엔드 → BSER | `GET /v2/user/stats/{userNum}/{seasonId}` |
| BSER 응답 → Contract | `mapToPlayerStats` |

> **확인 필요:** `seasonId` 결정 방식 미확정.
> 후보: current season config 파일, `env.CURRENT_SEASON_ID`, 백엔드 기본 상수.
> 인터페이스를 변경하지 않는 한 외부에서 seasonId를 넘기지 않고 백엔드 내부에서 결정해야 함.

---

### `fetchMatchHistory(userNum, page, pageSize)`

| 구분 | 내용 |
|------|------|
| 프론트 → 백엔드 | `GET /api/players/{userNum}/matches?page={page}&pageSize={pageSize}` |
| 백엔드 → BSER | `GET /v1/user/games/{userNum}` |
| BSER 응답 → Contract | `mapToMatchSummary` × N |

> **확인 필요:** BSER API 페이지네이션 방식 미확인 (page 기반 vs cursor 기반).
> 백엔드에서 BSER 응답을 `Paginated<MatchSummaryContract>`로 변환하는 로직 필요.
