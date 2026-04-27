# 배포 메모

프론트·백·DB를 나눠 올릴 때 기준만 적어 둔다. 실제 호스트명·리전은 각 서비스 콘솔에서 맞추면 된다.

---

## 프론트 (예: Vercel)

**환경 변수**

- `VITE_API_BASE_URL` — 배포된 백엔드 베이스 URL (예: `https://api.example.com`)

**빌드**

```bash
npm install
npm run build
```

출력 디렉터리는 **`dist/`**. Vercel이면 Framework Preset을 Vite로 두고 Root를 레포 루트로 맞춘다.

---

## 백엔드 (예: Railway / Fly.io)

**환경 변수**

- `DATABASE_URL` — MySQL 접속 문자열
- `PORT` — 컨테이너가 받는 포트 (플랫폼이 주입하는 경우 그대로 씀)
- `CORS_ORIGIN` — 실제 프론트 출처. 여러 개면 쉼표로 구분 (예: `https://app.example.com,http://localhost:5173`)
- `BSER_API_KEY` — BSER 연동 시에만. 비워 두어도 서버는 뜨게 둠

**시작 순서 (예시)**

```bash
npm install
npx prisma generate
npx prisma migrate deploy
node dist/server.js
```

이 레포는 **`backend/`**가 패키지 루트라서, 이미지 빌드 시 `WORKDIR`를 `backend`로 잡고 위 명령을 돌리면 된다.

---

## DB (예: Railway MySQL / 호스팅 MySQL)

**`DATABASE_URL` 형식 예**

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE
```

테스트·스테이징을 나누려면 `TEST_DATABASE_URL`은 별도 DB URL로 둔다.

---

## 보안 체크리스트

- **`BSER_API_KEY`는 백엔드 env에만** 둔다. 프론트 빌드에 넣지 않는다.
- **`.env` / `.env.local`은 git에 올리지 않는다.** 공유는 `.env.example`만.
- **`CORS_ORIGIN`**은 실제 브라우저에서 쓰는 프론트 URL로 제한한다. 개발 중에는 `http://localhost:5173` 정도로 두면 된다.
