# ADR-0008: 아케이드 플랫폼 — 게임 레지스트리 + 공용 셸

- **상태**: 적용됨 (2026-06-15, Phase 1)
- **관련**: [설계 스펙](../plans/2026-06-15-arcade-platform.md)

## Context

단일 게임(Zero Hour)에서 멀티 게임 아케이드로 전환. 홈을 게임 런처로 바꾸고, 게임이
플러그인처럼 꽂혀 계속 늘어날 수 있어야 함. 기존 게임플레이·테스트는 보존.

## Decision

**게임 레지스트리 + 공용 셸** (`js/shell.js`):
- 셸이 게임 무관 공통을 소유: 공유 캔버스(960×600) + rAF 루프(활성 게임의 `frame(dt,ctx)`만
  호출), `fit()`(스케일·세로 90° 회전·`SY.layout`), 게임 선택 **허브**(`#screen-arcade`,
  카드만), 라우팅(`SY.shell.enterGame/exitToHub`), 부팅(공용 settings 로드 → 오디오 적용 →
  허브 표시).
- 게임은 `SY.registerGame({ id, title, blurb, accent, enter, exit, frame, pause?, resume? })`로
  등록하고 자기 화면/HUD/기록을 소유. Zero Hour가 첫 등록 게임.
- **기록 네임스페이스**: `SY.store.forGame(id)` → `id:best_all`, `id:daily_<date>` 키.
  공용 `settings`(muted/haptics/seenHowto)는 전역. `SY.store.migrate(id)`가 pre-namespace
  키(`best_all`/`daily_*`)를 1회 멱등 마이그레이션(유실 방지).
- 파일: Zero Hour를 `js/games/zerohour/`로 이동. 공용 `js/store.js`·`js/audio.js`·`js/shell.js`.
- 입력(드래그 조이스틱)·chrome 버튼 핸들러는 Phase 1에서 Zero Hour에 잔류(phase 가드로 허브에서
  무해). 두 번째 게임이 드래그를 필요로 할 때 셸로 추출(YAGNI).

## Consequences

- (+) 게임 추가 = `SY.registerGame` 호출 1개 + 자기 모듈. 허브가 자동으로 카드 렌더.
- (+) 게임별 기록 격리, 기존 데이터 보존(마이그레이션).
- (+) Zero Hour 엔진/게임플레이 **무변경**(루프·fit만 셸로 이관). 기존 테스트가 안전망.
- (−) 셸 루프 단일 소유라 활성 게임만 그림. 허브에서는 캔버스 idle(오버레이가 덮음).
- (−) Phase 1은 입력/chrome가 Zero Hour에 남아 완전 일반화는 아님 — Phase 2(양치기 게임)에서
  공통 입력이 필요하면 셸로 끌어올린다.

## Verification

`enter()`는 메뉴를 즉시 표시하고 기록은 비동기 하이드레이트(헤드리스 IDB 비결정성 회피, UX↑).
단위 34(네임스페이스 store·마이그레이션 멱등성 포함) + E2E 41(허브 표시→진입→ARCADE 복귀 4종)
+ 번들 해시 동기화. Playwright로 허브 카드·진입·← ARCADE 시각 확인(세로 390×844).

## 개정 (2026-06-16) — 링크형(linked) 게임

두 번째 게임(Shepherd's Dog)은 자체 `<html>`·루프·캔버스·저장을 가진 독립 페이지라, 셸
계약(`enter/exit/frame`)으로 재작성하는 대신 **링크형**으로 편입. `SY.registerGame`가 `href`를
가지면(예: `js/games/shepards-dog/index.html`) 셸의 `enterGame`이 그 페이지로 이동만 한다.
게임은 그대로 보존되고, 게임 페이지에 "← Arcade" 링크로 허브 복귀. 등록은 작은
`js/games/shepards-dog/register.js`(셸 로드 후 index.html에서 로드)가 담당.

- 트레이드오프: 링크형 게임은 공유 셸/기록/chrome과 분리(자체 페이지). 또한 **오프라인 단일
  파일(standalone.html, file://)에서는 외부 페이지 도달 불가** → register.js가 `file:`에서는
  카드를 숨김. 서빙(개발/Vercel, standalone.html 포함)에서는 정상 동작.
- 완전 통합(셸 계약으로 재작성, 공유 캔버스·기록·랭크 연동)은 차후 옵션 A로 승격 가능.

검증: 단위 45 + E2E 42(허브에 두 카드, Shepherd 링크 카드 표시) + 번들 해시 동기화.
Playwright로 허브 2카드 → Shepherd 카드 클릭 → 게임 페이지 → ← Arcade 복귀 라운드트립 확인.
