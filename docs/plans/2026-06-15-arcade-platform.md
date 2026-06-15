# 설계 스펙: 아케이드 플랫폼 (Phase 1)

- **날짜**: 2026-06-15
- **상태**: 설계 승인 대기 (브레인스토밍 산출물)
- **결정 사항(브레인스토밍)**: 플랫폼 먼저(Phase 1) → 양치기 게임(Phase 2) · 게임 레지스트리 + 공용 셸 · 허브는 카드만(로고/타이틀 없음) · Zero Hour 파일을 `js/games/zerohour/`로 이동
- **관련 불변식**: [AGENT.md](../../AGENT.md), [rubric.md](../../rubric.md), [ADR-0002](../adr/0002-seeded-rng-daily-fairness.md)(공정성), [ADR-0006](../adr/0006-mobile-first-scaled-canvas-unscaled-ui.md)(세로 회전)

## Context

지금까지 단일 게임(Zero Hour). 사용자가 양치기 개(herding) 게임을 추가하려 하고, 게임이
계속 늘어날 수 있다고 함. 따라서 홈을 **게임 런처**로 바꾸고, 게임이 플러그인처럼 꽂히는
플랫폼으로 전환한다. Phase 1은 **플랫폼 셸 + Zero Hour를 첫 등록 게임으로 리팩터**까지만
하고(새 게임 없음), 기존 게임플레이·테스트가 그대로 동작함을 보장한다. Phase 2에서 양치기
게임을 두 번째 등록 게임으로 추가한다.

## 비목표 (Phase 1)

- 새 게임(양치기) 구현 — Phase 2.
- Zero Hour 게임플레이/밸런스/엔진 로직 변경 — 일절 없음(루프·입력·레이아웃만 셸로 이관).
- 온라인 리더보드·계정 — 범위 밖(기록은 여전히 IndexedDB 로컬).

## 아키텍처

### 셸 (`js/shell.js`, 신규) — 게임 무관 공통
소유 책임:
- **rAF 루프**: 활성 게임의 `frame(dt, ctx)`만 호출(dt는 1/30 클램프 유지).
- **`fit()`**: 캔버스 스케일 + 세로 90° 회전([ADR-0006]) + `body.portrait/landscape` 클래스 +
  `SY.layout.rot`. 게임 무관.
- **입력**: 뷰포트 드래그 → `SY.input.{ax,ay}`(세로 회전 보정 포함). 게임은 `SY.input`을 읽음.
  부유 조이스틱 시각도 셸 소유.
- **공용 chrome**: 음소거·풀스크린·일시정지 버튼, PWA/풀스크린 요청. 전 게임 공통.
- **허브 화면**(`#screen-arcade`): 등록된 게임 카드 그리드(로고/타이틀 없음). 카드 = 게임
  `title` + `blurb` + 최고 기록(옵션). 탭 → 해당 게임 진입.
- **라우팅**: `activeGame` 관리. `enterGame(id)` → `active.enter()`. `exitToHub()` →
  `active.exit()` 후 허브 표시. 일시정지 버튼은 `active.pause?.()` 위임(게임이 구현 시).

### 게임 계약 (`SY.registerGame(def)`)
```js
SY.registerGame({
  id: 'zerohour',           // 고유 id, 기록 네임스페이스 키
  title: 'ZERO HOUR',
  blurb: 'RETRO DRONE ARCADE · BEAT THE CORE WARDEN',
  accent: '#2de2c6',        // 카드 강조색
  enter(),                  // 허브에서 선택됨: 자기 첫 화면 표시 + 초기화
  exit(),                   // 허브로 복귀: 정지·리스너 정리·자기 DOM 숨김
  frame(dt, ctx),           // 활성 중 매 프레임: update + render + HUD
  pause?(), resume?(),      // 셸 일시정지 버튼/자동 일시정지 위임(옵션)
  bestScore?(),             // 허브 카드 표시용(옵션, async 허용)
})
```
- 셸은 등록 순서대로 허브 카드를 렌더.
- 캔버스(`#game-canvas`, 960×600)는 **공유**. 게임이 `frame`에서 clear+draw.
- 각 게임은 **자기 DOM**(화면·HUD·오버레이)을 소유하고 `enter/exit`에서 show/hide.

### 기록 네임스페이스 (`js/store.js` 확장)
- `SY.store.forGame(id)` → 동일 API(`loadAll/saveBestAll/saveDaily/loadRecentDailies/computeStreak`)이되
  키가 `id:` 접두(`zerohour:best_all`, `zerohour:daily_<date>`, `zerohour:seenHowto`).
- 공용 `settings`(muted/haptics)는 전역 유지(`SY.store.loadSettings/saveSettings`).
- **마이그레이션(1회)**: 기존 `best_all`/`daily_<date>`/`settings.seenHowto`가 있으면
  `zerohour:*`로 복사(유실 방지). 멱등 — 이미 네임스페이스 키가 있으면 skip.
- 시드 RNG(`SY.makeRng`)·날짜 유틸은 그대로 공용.

### DOM 구조 (`index.html`)
```
#viewport
  #stage  (#game-canvas + #crt)          ← 공유, 셸이 스케일/회전
  [공용 chrome 버튼: mute/pause/fullscreen]  ← 셸
  #screen-arcade  (게임 카드 그리드)         ← 셸, 부팅 시 첫 화면
  #game-zerohour  (Zero Hour의 HUD·화면·오버레이 전부 래핑)  ← 게임 소유
  (#game-shepherd … Phase 2)
```
- Zero Hour의 기존 DOM(#hud, #screen-menu/over/pause/howto/records, #boss-hp, #danger-vignette,
  #hit-flash)을 `#game-zerohour` 컨테이너로 감싸 enter/exit 시 일괄 show/hide.
- 각 게임 메뉴에 **"← ARCADE"** 버튼 추가 → `SY.shell.exitToHub()`.

### 파일 이동
```
js/shell.js                         (신규)
js/store.js  js/audio.js            (공용 유지)
js/games/zerohour/
  game.js  render.js  main.js  tweaks-panel.jsx  tweaks.jsx   (git mv)
```
- `index.html`의 `<script src>` 경로 갱신(셸 먼저, 그다음 게임). 빌드 스크립트는 src 경로
  기반이라 하위 폴더 자동 처리.
- Zero Hour `main.js`: 부팅/루프/fit/입력/공용chrome 로직을 **셸로 이관**하고, 나머지(HUD·
  화면·기록·스파크라인·카운트다운)는 `enter/exit/frame`으로 감싸 `SY.registerGame`로 등록.

## 데이터 흐름

1. `shell.js` 부팅 → 공용 settings 로드 → 등록된 게임들로 허브 카드 렌더 → `#screen-arcade` 표시.
2. 카드 탭 → `enterGame('zerohour')` → Zero Hour `enter()`(기록 로드 via `store.forGame`,
   메뉴 표시, 첫 방문 how-to 게이트). 셸 루프가 `zerohour.frame()` 호출 시작.
3. 게임 중 일시정지/음소거/풀스크린 = 셸 chrome(전역). "← ARCADE" → `exitToHub()`.
4. 게임 오버/기록 = 게임 자체 화면 + `store.forGame('zerohour')`.

## 엣지 케이스

- 활성 게임 없음(허브 표시 중): 루프는 캔버스만 클리어(또는 idle), `frame` 미호출.
- 자동 일시정지(blur/visibility): 활성 게임이 `pause()` 구현 시 위임, 없으면 무시.
- 세로 회전·입력 보정은 셸이 단일 소유 → 모든 게임이 동일 규칙. 게임은 `SY.input`만 읽음.
- 마이그레이션 멱등성: 재실행해도 기존 `zerohour:*` 덮어쓰지 않음.
- 빌드 산출물: 파일 이동 후 `/build-standalone` 재생성, 해시 동기화 검사 통과.

## 테스트 전략

- **기존 회귀 안전망**: 단위 31 + E2E 39 — 경로 갱신(`js/games/zerohour/...`) 후 전부 그린 유지.
  Zero Hour 엔진 무변경이 핵심 보증.
- **신규 단위**: `store.forGame` 네임스페이스 키, 마이그레이션 멱등성(기존 키→`zerohour:*`).
- **신규 E2E 시나리오**: 부팅 시 허브 표시 → Zero Hour 카드 탭 → 진입(메뉴) → 플레이 →
  "← ARCADE" 복귀 → 허브 재표시. 등록 게임 1개 렌더 확인.
- **정적**: 게임 코어 React-free·IIFE·시드 RNG tripwire는 새 경로에도 유지. 셸도 동일 규칙.
- Playwright 라이브: 허브 카드 그리드·진입/복귀 시각 확인(세로 390×844).

## Verification

`test\run-all.ps1` ALL PASS(단위+E2E+번들 해시) + 헤드리스/Playwright 허브·진입 스크린샷.
완료 기준: 허브에 Zero Hour 카드 1개, 진입→플레이→복귀가 기존과 동일 동작, 기록 보존, 테스트 그린.

## Phase 2 개요 (별도 스펙 예정)

`SY.registerGame`로 양치기 개 게임 추가: 드래그로 개 조작 → 양 떼를 우리로 몰기, 제한시간/점수,
`store.forGame('shepherd')`. 레트로 네온 Canvas 2D 톤 유지. 별도 브레인스토밍 → 스펙 → 플랜.
