# 3일차 — 돌아보기

---

DB랑 서버 스택은 아직 안 정했고, 나중에 붙일 때 쓸 **ERD·내부 API 초안**만 적어 둔 날이다. 아래 표·샘플은 그때 기준으로 잡아 둔 것.

---

## ERD

외부 플레이어 ID는 `player_user_num`(숫자), 우리 쪽 로그인 유저는 `users.id`(UUID)

**users** — 로그인한 사람

| 컬럼 | 타입 | 메모 |
|------|------|------|
| id | UUID | PK |
| provider | varchar | google, discord 등 |
| provider_sub | varchar | OAuth sub |
| display_name, email | nullable | |
| created_at, updated_at | timestamp | |

UNIQUE (provider, provider_sub)

**favorite_players**

| 컬럼 | 타입 |
|------|------|
| id | bigserial PK |
| user_id | FK → users, cascade delete |
| player_user_num | bigint |
| nickname_snapshot | varchar |
| created_at | timestamp |

UNIQUE (user_id, player_user_num). 인덱스 (user_id, created_at desc)

**search_history**

| 컬럼 | 타입 |
|------|------|
| id | bigserial PK |
| user_id | FK → users |
| query | varchar |
| matched_user_num | bigint, nullable |
| created_at | timestamp |

인덱스 (user_id, created_at desc) 최근 N개만 쓸지는 앱에서 자르기

**cached_player_stats** — 외부에서 받아 온 스탯 캐시

PK (player_user_num, season_id). 컬럼: nickname, level, tier, mmr, games, wins, losses, kills, deaths, assists, top3, refreshed_at. 닉네임 조회용 인덱스 하나, 시즌+mmr 정렬 생각하면 (season_id, mmr desc) 정도.

**cached_match_history** — 플레이어 기준 한 줄씩

PK (match_id, player_user_num). season_id, character_name, placement, kills, deaths, assists, damage/vision은 nullable, victory, game_started_at, refreshed_at.

인덱스 (player_user_num, game_started_at desc) 필수. 시즌·기간 필터 넣을 거면 season_id, game_started_at 쪽도.

---

## TS로 보면 (DB 행)

프론트 `PlayerSummary` / `PlayerStats` / `MatchSummary`랑 맞출 필드는 그대로 두고, DB 전용은 Row로 이름만

- `UserRow`, `FavoritePlayerRow`, `SearchHistoryRow`
- `CachedPlayerStatsRow` — 위 cached_player_stats 컬럼 그대로
- `CachedMatchRow` — 캐시 테이블 한 줄

API에서만 쓰는 건 예를 들면:

- `Paginated<T>` — items, page(0부터), pageSize, hasNext
- 즐겨찾기 응답: playerUserNum, nickname, addedAt
- 검색 기록 한 줄: query, matchedPlayer(optional), createdAt

에러는 `{ error: { code, message, details? } }` 형태로 통일.

---

## 내부 API (/api)

성공 시 전부 `ApiResult<T>` — data, source(external|cache), refreshedAt.

| 메서드 | 경로 | 비고 |
|--------|------|------|
| GET | /api/players/search?nickname= | 2글자 이상 |
| GET | /api/players/{nickname} | 단일 요약 |
| GET | /api/players/{nickname}/matches | 아래 참고 |
| GET | /api/players/{nickname}/stats | ?season 선택 |
| POST | /api/favorites | body에 playerUserNum, 로그인 필요 |
| GET | /api/search-history | ?limit, 로그인 필요 |

matches는 지금은 page + pageSize면 되고, 나중에 season, from/to, 캐릭터, 승패 필터 붙여도 응답 형태는 `Paginated<MatchSummary>` 유지하는 쪽으로.

자주 나올 에러: 400(입력), 401(인증), 404(플레이어 없음), 409(즐겨찾기 중복), 502(외부 API 망가짐).

---

## 응답 샘플 (참고용)

검색:

```json
{
  "data": [
    {
      "userNum": 482901,
      "nickname": "ShadowCrescent",
      "level": 87,
      "tier": "Diamond IV",
      "profileImageUrl": null
    }
  ],
  "source": "cache",
  "refreshedAt": "2026-04-19T10:05:00.000Z"
}
```

프로필 한 명:

```json
{
  "data": {
    "userNum": 482901,
    "nickname": "ShadowCrescent",
    "level": 87,
    "tier": "Diamond IV",
    "profileImageUrl": null
  },
  "source": "cache",
  "refreshedAt": "2026-04-19T10:05:00.000Z"
}
```

매치 페이지:

```json
{
  "data": {
    "items": [
      {
        "matchId": "m-1001",
        "userNum": 482901,
        "characterName": "Yuki",
        "placement": 1,
        "kills": 9,
        "deaths": 2,
        "assists": 4,
        "gameStartedAt": "2026-04-14T18:22:00.000Z",
        "victory": true
      }
    ],
    "page": 0,
    "pageSize": 10,
    "hasNext": true
  },
  "source": "cache",
  "refreshedAt": "2026-04-19T10:05:00.000Z"
}
```

스탯:

```json
{
  "data": {
    "userNum": 482901,
    "seasonId": 12,
    "games": 214,
    "wins": 118,
    "losses": 96,
    "kills": 1840,
    "deaths": 1202,
    "assists": 910,
    "top3": 156,
    "mmr": 2840
  },
  "source": "cache",
  "refreshedAt": "2026-04-19T10:05:00.000Z"
}
```

즐겨찾기 추가 POST:

```json
{
  "data": {
    "playerUserNum": 482901,
    "nickname": "ShadowCrescent",
    "addedAt": "2026-04-19T10:05:12.480Z"
  },
  "source": "cache",
  "refreshedAt": "2026-04-19T10:05:12.480Z"
}
```

검색 기록 GET:

```json
{
  "data": [
    {
      "query": "shadow",
      "matchedPlayer": {
        "userNum": 482901,
        "nickname": "ShadowCrescent",
        "level": 87,
        "tier": "Diamond IV"
      },
      "createdAt": "2026-04-19T09:58:11.000Z"
    },
    {
      "query": "xxxz",
      "createdAt": "2026-04-18T22:05:02.000Z"
    }
  ],
  "source": "cache",
  "refreshedAt": "2026-04-19T10:05:00.000Z"
}
```

테스트용이라 숫자·날짜는 mock이랑 비슷하게.
