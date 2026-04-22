# Jangi

한국 장기 앱을 위한 모노레포 초안입니다.

## 구조

- `apps/web`: React + Vite 웹 클라이언트
- `apps/server`: NestJS 기반 게임 서버
- `packages/game-engine`: 장기 규칙 엔진
- `packages/shared-types`: 공용 타입 정의

## 시작

```bash
corepack enable
corepack prepare pnpm@10.7.0 --activate
pnpm install
pnpm dev:web
pnpm dev:server
```

`Node 22` 환경에서는 글로벌 `pnpm 7.x`가 레지스트리 조회 중 실패할 수 있으므로 `corepack`으로 고정 버전을 사용하는 것을 전제로 합니다.

## 데모 실행

로컬 웹 데모는 아래 순서로 실행할 수 있습니다.

```bash
corepack enable
corepack prepare pnpm@10.7.0 --activate
pnpm install
pnpm test
pnpm build
pnpm --filter @jangi/web dev --host 127.0.0.1 --port 4173
```

브라우저에서 `http://127.0.0.1:4173`로 접속하면 됩니다.

## 우선순위

1. 규칙 엔진 완성
2. 로컬 대전 UI 연결
3. 서버 authoritative 온라인 대전 구현
