# DESIGN — Neon Vortex Arcade Pilot

이 프로젝트의 기술 설계 개요. 흩어진 결정 기록([docs/adr/](docs/adr/))을 하나의
아키텍처 그림으로 묶는다. 빠른 규칙은 [AGENT.md](AGENT.md), 평가 기준은
[rubric.md](rubric.md), 함정 모음은 [LEARNINGS.md](LEARNINGS.md),
디자인 시스템(토큰·컴포넌트·접근성)은 [docs/design-system.md](docs/design-system.md) 참조.

---

## 1. 목표와 제약

60초 레트로 아케이드 드론 슈터. 핵심 가치는 **데일리 챌린지의 공정성**(같은 날 전 세계가
같은 맵) + **즉시 실행**(설치·빌드·서버 없음).

| 제약 | 근거 |
|---|---|
| 빌드 도구·package.json 없음 | 브라우저로 바로 열거나 `npx serve .`. 학습·이식 비용 0 |
| 순수 HTML/CSS/JS + Canvas 2D | 의존성 0. 외부 프레임워크/CDN 없는 순수 바닐라 JS |
| 논리 아레나 960×600 고정 | 모든 기기가 동일 좌표계 → 시드 RNG로 동일 맵 보장 ([ADR-0002](docs/adr/0002-seeded-rng-daily-fairness.md)) |
| 서버 통신 없음 | 기록은 IndexedDB 로컬. 개인정보 미수집 |

---

## 2. 아키텍처 개요

모든 JS 모듈은 IIFE로 `window.SY` 네임스페이스에 붙는다. `index.html`의 스크립트 로드
순서가 의존성 순서다: **`store → audio → shell → sprites → meta → medals → game → render → main`**.
게임 무관 셸(`js/`)과 게임 모듈(`js/games/neonvortex/`)을 분리한다 ([ADR-0008](docs/adr/0008-arcade-platform-shell.md)).

```
                                 window.SY
   ── 게임 무관 셸 (js/) ─────────────┐   ── 게임 (js/games/neonvortex/) ──────────────┐
   ┌──────────┬──────────┬──────────┐ │ ┌──────────┬──────────┬──────────┬──────────┐
   │ store    │ audio    │ shell    │ │ │ game     │ render   │ medals   │ main      │
   │ (RNG +   │ (WebAudio│ (레지스트리│ │ │ (engine: │ (Canvas  │ (티어 +  │ (등록·UI  │
   │  Indexed │  SFX +   │ ·rAF 루프│ │ │  state/  │  2D draw,│  배지)   │  글루:HUD·│
   │  DB)     │  haptics)│ ·fit·부팅)│ │ │  sim/AI) │  hot path)│         │  화면)    │
   └────┬─────┴────┬─────┴────┬─────┘ │ └────┬─────┴────┬─────┴────┬─────┴────┬─────┘
        │          │   활성 게임의   │      │          │          │          │
        │          │   frame(dt,ctx)─┼──────┘          │          │          │
        └ SY.makeRng/SY.store  SY.audio          SY.nvGame  SY.render  SY.nvSprites/nvMeta
                                                 (+ DOM, css/{tokens,style,neonvortex}.css)
```

- **셸 vs 게임**: `store`·`audio`·`shell`은 게임 무관(`js/`). `shell`이 레지스트리·rAF
  루프·레이아웃을 소유하고, 부팅 시 등록된 단일 게임으로 직행(`SY.shell.enterGame()`, 허브 없음)
  하며 매 틱 활성 게임의 `frame(dt,ctx)`만 호출한다.
- **레이어 경계**: `game.js`는 순수 시뮬레이션(DOM·canvas 무지). `render.js`는 읽기 전용
  그리기(상태 변경 안 함). `main.js`만 DOM·IndexedDB·입력을 만진다. UI 차트(스파크라인)는
  game 캔버스가 아니므로 `main.js` 소속이다.
- **의존성 없음**: 게임 코어는 외부 프레임워크/CDN 없이 동작한다. 튜닝 상수는 `SY.tweaks`
  기본값(`game.js`)으로 관리한다. 코스메틱 메타(`SY.nvMeta`)는 표시 전용 — 시뮬에 되먹임 금지.

---

## 3. 런타임 모델

### 게임 루프 (rAF는 `shell.js`, 프레임 작업은 게임의 `frame`)
```
shell.js  requestAnimationFrame(loop):
  dt = min(1/30, elapsed)         // 탭 복귀 시 시간 점프 방지 클램프
  active.frame(dt, ctx)           // 활성 게임에 위임 (neonvortex/main.js):
    G.update(dt)                  //   시뮬레이션 1틱
    SY.render(ctx)                //   프레임 그리기
    updateHud()                   //   HUD DOM 갱신
```
셸 루프는 항상 돈다. 멈춤은 phase로 표현한다(루프 중단이 아님).

### Phase 상태머신 (`G.phase`) — [ADR-0003](docs/adr/0003-pause-system-and-quit-semantics.md)
```
        start()                readyT<=0           timeLeft<=0 | hp<=0
  menu ─────────▶ ready ──────────────▶ playing ─────────────────▶ over
   ▲                │                    │  ▲                         │
   │ toMenu()       │ pause()      pause()│  │resume()        retry / │
   │ (QUIT, 무기록) ▼                    ▼  │                  menu   │
   └──────────────── paused ◀────────────┘  │                         │
   └─────────────────────────────────────────────────────────────────┘
```
- `update()`는 `paused`/`over`에서 시뮬을 전진시키지 않는다(코스메틱 동결 포함).
- 전이마다 입력 리셋(`resetKeys()` + 조이스틱 축 0) — `pause`/`resume`/`start` 전부.
  blur로 keyup이 유실돼도 키가 고착되지 않는다.
- QUIT은 `endGame()`을 경유하지 않고 `toMenu()` 직행 → `onGameOver` 미호출·미저장이
  **구조적으로** 보장(플래그 아님).

---

## 4. 모듈별 설계

### `js/store.js` — 영속성 + 시드 RNG
- **시드 RNG**: `SY.makeRng(seedStr)` = xmur3 해시 → mulberry32. 데일리 시드는
  `daily-YYYY-MM-DD`(UTC), 프리플레이는 `free-<random>`.
- **IndexedDB kv 스토어**(`scoreyard` DB): `loadAll / saveSettings / saveBestAll /
  saveDaily`. 키: `settings`, `best_all`, `daily_<date>`.
- **날짜 유틸**: `todayUTC()`, `utcDateMinus(n)`(`Date.UTC` 산술 — 월/연 경계 안전),
  `loadRecentDailies(n)`, `computeStreak()`(저장 카운터 없이 키에서 계산, 자가 치유).

### `js/audio.js` — WebAudio SFX + 햅틱
- 에셋 파일 0. 오실레이터+노이즈로 합성. `setMuted/isMuted/unlock` + 효과 함수들.
- **햅틱**(모바일): `buzz(pattern)`이 `navigator.vibrate` 가드 + 설정 게이트.
  hit/shieldPop/bossDown/gameOver에 연결. `setHaptics/hapticsOn`.

### `js/shell.js` — 런타임 셸 (게임 무관) — [ADR-0008](docs/adr/0008-arcade-platform-shell.md)
- **레지스트리**: `SY.registerGame({id,title,blurb,accent,enter,exit,frame})`. 단일 게임이
  등록되며, 부팅 시 셸이 그 게임으로 직행한다(허브 없음).
- **공용 rAF 루프**: 매 틱 활성 게임의 `frame(dt,ctx)`만 호출. **반응형 `fit()`**(스케일 +
  세로 90° 회전, `SY.layout`)도 셸 소속.
- **부팅**: `SY.shell.enterGame()`가 등록된 게임의 `enter()`를 호출 → 게임 메뉴로 진입.

### `js/games/neonvortex/game.js` — 엔진 (시뮬레이션의 단일 출처, `SY.nvGame`)
- `freshState(mode, seed)`가 런 상태 전체를 생성(§5). `G.update(dt)`가 한 틱.
- 스폰/드랍/확률은 **전부 `s.rng()`** — 공정성 핵심. `Math.random()`은 코스메틱 전용
  (파티클·흔들림·보스 사망 연출). tripwire 테스트가 baseline 고정.
- 충돌은 브루트포스 페어 체크(엔티티 수가 작아 충분). 거리 비교는 제곱(`dist2`)으로.
- `addScore(base, x, y, label, bucket)`: ×2 배율 적용 후 버킷 가산. "버킷 합 ≡ score"
  불변식 유지(§6).
- 보스 AI: 등장(`bossWarnT`) → 진입 → 스웨이/사격 → 격파 시 `dying` 타이머 → 폭발+1500.

### `js/games/neonvortex/render.js` — Canvas 2D 렌더러 (60fps 핫패스)
- `SY.render(ctx)`가 매 프레임 호출. 그리기 순서: 배경/그리드 → 웨이브 → 크리스털/바위/
  파워업/기뢰 → 총알 → 보스/플레이어 → 파티클 → 플로팅 텍스트 → 배너/카운트다운.
- 화면 흔들림은 `ctx.translate`로, slow-mo 틴트는 배경 오버레이로.
- **성능 규칙**: 프레임 루프 내 신규 할당(객체/배열/클로저) 금지. 변경 후
  `performance-analyzer` 에이전트로 점검.

### `js/games/neonvortex/medals.js` — 메달 & 점수 티어 (`SY.nvMedals`) — [ADR-0009](docs/adr/0009-medals-and-tiers.md)
- 런 결과 → 랭크(Recruit/Pilot/Ace/Legend) + 달성 메달 판정. 순수 로직(DOM/IDB 없음).
- 코스메틱 라이프타임 누적·랭크는 `meta.js`(`SY.nvMeta`)가 담당(표시 전용).

### `js/games/neonvortex/main.js` — UI 글루
- HUD DOM 갱신, 화면 전환(`show()` — 인터벌 정리 중앙화), 기록 저장,
  공유 텍스트, 결과 스파크라인, 카운트다운, 터치 조이스틱.
- 화면 단축키는 phase가 아닌 **DOM visibility**로 가드(over 화면은 650ms 지연 표시).
- 셸이 호출하는 `enter/exit/frame`을 등록(`SY.registerGame`).

### `assets/` — 아트 자산 & `sprites.js`(`SY.nvSprites`)
`sprites.js`가 `assets/sprite-atlas.png`(1448×1086) 단일 시트를 9-arg `drawImage`
크롭으로 그린다. 디코드 전·실패 시 벡터 도형 폴백(핫패스 무할당). 도색
(neon/stealth/solar)은 코팅별 오프스크린 캔버스 1회 프리캐시 — 시뮬·RNG 무관 코스메틱.

**방향(2026-06-29): 모든 에셋을 다 활용한다(full utilization).** `sprites.js`의 `A`
rect 테이블(~59키) + `POWER_ICONS` + `UI`가 두 게임 시트의 스프라이트를 코드에서
참조한다. 남은 미사용 스프라이트는 `docs/plans/2026-06-29-full-asset-utilization-
roadmap.md`의 작업 대상(이전의 "억지 회피 → 잔여 미사용 허용" 방침은 폐기). 데일리
공정성(시드 RNG)은 별개 불변식으로 유지.

| 파일 | 용도 | 코드 사용 |
|---|---|---|
| `sprite-atlas.png` | 메인 게임 아틀라스 (8섹션: 파워업·적·월드·웨폰·환경·보스·통화·기체/드론) | ✅ `sprites.js` `A`/`POWER_ICONS` + preload |
| `sprite-elements.png` | 크리스털·총알·폭발 등 정밀 게임 요소 (rect에 `sheet:'el'` 태그) | ✅ `sprites.js` `gpSheet`(`draw`/`drawFit` 라우팅) |
| `ui-kit.png` | 네온 HUD 키트 — 아레나 위 레티클·배너만 사용 (HUD 크롬 부분은 DOM이라 미사용) | ✅ `sprites.js` `UI`/`drawUi`(`lighter` 블렌드) |
| `sprite-reference.png` | 라벨 스프라이트 설계 참조 시트(좌표 문서) | ✗ 설계 참조(패킹 불가) |
| `keyart.png` | 키아트(히어로 배너) | ✗ 마케팅 자산 |

함선 상태 프레임 `shielded`·`boosted`·`damaged`는 `render.drawPlayer`가 상태
(실드/저체력/부스트)에 따라 선택해 사용. 터렛=`enemyMid`, 락=`enemyBig`,
지뢰=`enemySmall`(elements 시트). `beam`은 엘리트 빔 머즐, `burst`(elements)는 파괴
폭발로 사용 중. 파워업 배지는 섹션1 "POWER-UPS/PICKUPS"를 색 틴트해 사용
(`SY.nvSprites.drawPowerIcon`).

---

## 5. 런 상태 구조 (`G.state`)

```
{
  rng, seedStr, mode, duration,
  t, timeLeft, readyT,                 // 시간
  score, combo, maxCombo, comboT,
  pace[], paceSec,                     // 초당 점수 스냅샷 (스파크라인·페이스 비교)
  player { x,y,vx,vy,r,hp,inv,fireCd,angle,thrust },
  crystals[], rocks[], mines[], bullets[], ebullets[], pows[],
  parts[], waves[], floats[],          // 코스메틱
  boss, bossDown, bossWarnT,
  fx { MAGNET, SLOW, X2, BOOST, SPREAD },  shield,   // 활성 파워업
  freeze, shake,                       // 히트스톱·흔들림
  spawnT{}, powBag[], lastWholeSec, collected,
  breakdown { crystals, combo, destruction, boss },  // 점수 출처
}
```
게임 오버 시 `endGame`이 이 중 일부 + `seedStr`을 `res`로 포장해 `onGameOver(res)` 호출.

---

## 6. 점수 시스템

| 행동 | 점수 | 버킷 |
|---|---|---|
| 크리스털 수집 | `10 + combo` | `crystals`(10) + `combo`(나머지) |
| 기뢰 파괴 | 25 | `destruction` |
| 바위 파괴 | 40 (+크리스털 4~5 드랍, 45% 파워업) | `destruction` |
| 보스 명중 | 5 | `boss` |
| 보스 격파 | 1500 (+크리스털 14 폭발) | `boss` |

×2 파워업은 각 버킷 안에서 2배 적용 → **버킷 4개 합 = 최종 score** 불변식(테스트로 강제).
상수는 README 표와 동기화 유지.

---

## 7. 레이아웃 모델 — 세로 모바일 First ([ADR-0006](docs/adr/0006-mobile-first-scaled-canvas-unscaled-ui.md))

**주 타깃은 세로 모바일.** 가로·PC는 개발용 폴백으로만 둔다.

**스케일되는 캔버스 / 스케일 안 되는 UI** 분리:
- `#stage`(`<canvas>` + `#crt`)만 `transform`으로 뷰포트에 맞춘다.
- HUD·4개 화면·버튼은 뷰포트 레벨 fixed DOM — `clamp()`·`flex-wrap`·
  `env(safe-area-inset-*)`로 자연 크기 적응. 스케일되지 않아 글자가 작아지지 않는다.

`fit()`(main.js)이 `visualViewport` 기준으로 방향 클래스를 body에 부여:
- **세로(`body.portrait`, 주)**: 1.6:1 가로 아레나를 **90° 회전**해 화면 폭을 edge-to-edge로
  가득 채운다(390px 폭 폰에서 390×624px, 폭 맞춤이던 244px의 2.5배 면적). 상시 HUD 바는
  위에서 정상 방향 유지. 드래그는 큰 아레나 위 어디서나(부유 조이스틱). 회전에 맞춰
  **입력 축을 재매핑**(화면 (dx,dy) → 아레나 (dy,−dx))해 드래그 방향과 화면상 드론 이동을 일치.
- **가로(`body.landscape`)**: contain-fit 중앙 아레나 + 반투명 HUD (폴백, 비주력).

트레이드오프: 회전으로 캔버스 안 일시적 텍스트(READY/보스 배너/점수 팝업)는 옆으로 눕지만,
읽기 핵심인 상시 HUD·화면은 DOM이라 정상 방향. 엔진(`game.js`)은 무변경.

**PWA/풀스크린**: `manifest.json`(fullscreen) + 아이콘. 터치 기기는 게임 시작 제스처에
편승해 Fullscreen API 자동 요청(미지원 시 버튼 숨김).

---

## 8. 빌드 & 배포 — 듀얼 HTML ([ADR-0001](docs/adr/0001-dual-html-generated-standalone.md))

| 파일 | 역할 |
|---|---|
| `index.html` + `js/` + `css/` | **유일한 소스**. Vercel 배포 진입점 |
| `standalone.html` | **생성 산출물**. `js`·`css`·CDN 라이브러리를 인라인한 단일 오프라인 파일 |

재생성: `node .claude/skills/build-standalone/build.mjs`. 3중 가드 — PreToolUse 훅(직접
수정 차단) + PostToolUse 훅(stale 리마인드) + 테스트의 해시 동기화 검사. 배포는 git
push → Vercel (https://zero-hour-seven.vercel.app), dev 파일은 `.vercelignore`로 제외.

---

## 9. 테스트 아키텍처 — 의존성 0 ([ADR-0005](docs/adr/0005-zero-dependency-test-strategy.md))

| 계층 | 도구 | 커버 |
|---|---|---|
| 단위 | `node --test` + vm 샌드박스(IIFE 로드, IndexedDB 스텁, 고정 시계) | store/game 로직, 시드 결정성, 버킷 합, streak 경계 |
| 정적 | tripwire 테스트 | React-free, 시드 RNG baseline, innerHTML 싱크 핀, 인라인 style 예산 |
| E2E | 헤드리스 Chrome/Edge + 리포트 서버 | 8 시나리오(boot/settings/howto/quit/pause/over/rollover/layout/records), rAF 수동 스텝 |
| 동기화 | fresh build 해시 비교 | standalone 재현성 |

일괄 실행: `test/run-all.ps1`. 독립 Verifier가 [rubric.md](rubric.md)로 평가 →
[docs/reviews/](docs/reviews/)에 보고서.

---

## 10. 핵심 불변식 (변경 시 반드시 유지)

1. 게임플레이 난수는 `s.rng()`만 (공정성).
2. 점수 버킷 합 ≡ 최종 score.
3. 데일리 기록은 런의 시드 날짜로 귀속([ADR-0004](docs/adr/0004-daily-records-filed-by-seed-date.md)).
4. 게임 코어 의존성 0(바닐라 JS), 모든 모듈 IIFE + `window.SY`. 코스메틱 메타는 시뮬에 되먹임 금지.
5. 60fps 핫패스(`game.update` + `render`) 프레임당 할당 0.
6. `standalone.html`은 생성물 — 직접 수정 금지.
7. 점수 상수 ↔ README 표 동기화.

---

## 11. 의사결정 기록 (ADR)

| # | 제목 |
|---|---|
| [0001](docs/adr/0001-dual-html-generated-standalone.md) | 듀얼 HTML — 소스 + 생성형 standalone |
| [0002](docs/adr/0002-seeded-rng-daily-fairness.md) | 시드 RNG로 데일리 공정성 |
| [0003](docs/adr/0003-pause-system-and-quit-semantics.md) | 일시정지 + QUIT 무기록 |
| [0004](docs/adr/0004-daily-records-filed-by-seed-date.md) | 시드 날짜 기반 기록 귀속 |
| [0005](docs/adr/0005-zero-dependency-test-strategy.md) | 의존성 0 테스트 전략 |
| [0006](docs/adr/0006-mobile-first-scaled-canvas-unscaled-ui.md) | 모바일 First — 스케일 캔버스/비스케일 UI |
| [0007](docs/adr/0007-records-screen-and-arena-hud.md) | RECORDS 화면 + 아레나 HUD를 DOM 오버레이로 |
| [0008](docs/adr/0008-arcade-platform-shell.md) | 아케이드 플랫폼 — 게임 레지스트리 + 공용 셸 |
| [0009](docs/adr/0009-medals-and-tiers.md) | 메달 & 점수 티어 |
