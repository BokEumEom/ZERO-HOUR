# ADR-0005: 의존성 0 테스트 전략 — vm 샌드박스 + 헤드리스 E2E

- **상태**: 적용됨 (2026-06-11, commit `dd98ea9`)
- **관련**: [루브릭](../rubrics/2026-06-11-completeness-upgrade-rubric.md)

## Context

프로젝트는 빌드 도구·package.json 없는 순수 JS다. Jest/Playwright를 들이면
"설치 없이 실행"이라는 프로젝트 성격이 깨진다. 한편 게임 코드는 IIFE +
`window.SY` 전역 패턴이라 일반적인 모듈 import 테스트가 불가능하다.

## Decision

### 단위 테스트: Node 내장 + vm 샌드박스 (`test/unit/`)
- 러너는 Node 24 내장 **`node --test`** — 외부 의존성 0.
- IIFE 모듈은 `vm.createContext` 샌드박스에 로드: `window = sandbox`(자기참조),
  리스너 캡처(`dispatch()`로 키 이벤트 주입), `SY.audio`는 Proxy noop.
- IndexedDB는 store.js가 쓰는 API 표면만(open/upgrade/transaction/get/put) ~50줄 인메모리 스텁.
- 시계는 `Date` 서브클래스로 동결 → 월/연 경계·streak 픽스처가 결정적.
- **realm 함정**: vm 산 Array는 호스트 `deepStrictEqual`에서 프로토타입 불일치 → `Array.from` 복사 후 비교.

### E2E: 헤드리스 Edge + 리포트 서버 (`test/e2e/`)
- 시스템 Edge를 `--headless=new --virtual-time-budget`으로 구동 — 브라우저 설치 의존성 0.
- 미니 Node 서버(`server.mjs`)가 정적 서빙 + `/report` POST 수집 → exit code로 pass/fail.
- **가상 시간에서 rAF는 굶는다**: 하니스가 `G.update(dt)`를 수동 스텝 (엔진의 rAF 분리 설계가 전제).
- 시나리오 라우팅은 쿼리스트링이 아닌 **해시** (`serve`류 cleanUrls 리다이렉트가 쿼리를 삼킴).
- 어서션은 비자명성 보장: 결정적 픽스처 주입(크리스털 강제 스폰)으로 score>0 상태에서 검증,
  리포트에 실측값(score=348) 포함해 자명 통과를 식별 가능하게.

### 정적 가드: 컨벤션의 테스트화 (`static.test.mjs`)
베이스라인 핀으로 규칙 위반 시 강제 리뷰 발동: `Math.random` ≤14, innerHTML 싱크 ==3,
인라인 style ≤6, React-free 코어, 스크립트 로드 순서, 스파크라인의 render.js 격리.

### 일괄 실행
`test/run-all.ps1` = 단위 + E2E + standalone **해시 동기화 검사** (temp fresh build 비교 —
`git diff` 방식은 커밋 전 항상 실패하므로 기각).

## Consequences

- (+) `npm install` 없이 클론 직후 전체 스위트 실행 가능, CI 도입 시에도 Node+Edge만 요구
- (+) 결정적 시뮬(시드+수동 스텝) 덕에 flaky 어서션 원천 차단
- (−) Playwright급 브라우저 매트릭스·트레이스 없음 — 단일 Chromium 엔진으로 수용
- (−) vm 샌드박스는 DOM 없음 → main.js(UI 글루)는 E2E에서만 커버 (의도된 분담)
