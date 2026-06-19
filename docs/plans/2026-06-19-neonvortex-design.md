# 설계 — NEON VORTEX (Stitch 디자인 기반 고퀄 리메이크)

> 상태: 설계 승인 대기. 구현은 M1→M2→M3→M4 단계적 출하.
> 디자인 소스: `Downloads/stitch_neon_core_warden_ui/` (Google Stitch 산출물 —
> `neon_syndicate/DESIGN.md` + `_1`(메뉴)/`hud`(인게임)/`_2`(결과)/`_3`(상점) 목업).

## 1. 배경 & 의도

기존 `ship` 게임(Zero Hour 클론 + 스프라이트 교체, 최소 DOM)을 폐기하고, Stitch가
제시한 완성형 디자인 시스템("Neon Syndicate" / `ARCADE_PILOT_OS` 셸 / Core Warden
보스)을 기준으로 **허브에 끼워지는 고퀄리티 플러그인 게임**으로 다시 만든다.

확정된 방향(사용자 결정):
- Stitch 디자인대로 **재구현**(미니멀 스프라이트 버전 폐기).
- **허브 통합 플러그인** 게임(`SY.registerGame`) — 플랫폼 아키텍처 유지.
- **신규 시스템까지 풀 구현**: 상점/영구 재화 + 어빌리티(LASER/PULSE/EMP) + BOOST +
  웨이브/스테이지.
- **공정성 모델**: 데일리는 고정 로드아웃, 업그레이드/상점/스킬은 프리플레이 전용.
- **게임 루프**: 하이브리드 — 타임드 런을 가시적 웨이브/스테이지로 구조화, 보스는
  스테이지 클라이맥스.
- **어빌리티**: 각자 재사용 대기시간(쿨다운) 기반 액티브, 자동사격은 기본 유지.

## 2. 정체성 & 네이밍

| 항목 | 값 | 비고 |
|---|---|---|
| 표시 타이틀 | **NEON VORTEX** | 허브 카드·메뉴 타이틀 (Stitch `_1` 그대로) |
| 내부 id | **`neonvortex`** | `registerGame({id})`, 저장 네임스페이스, DOM 접두사 |
| 폴더 | `js/games/neonvortex/` | 기존 `js/games/ship/`에서 개명 |
| accent | cyan `#00dbe7` (primary), magenta `#ff24e4` (위협), gold `#ffba20` (재화) |
| 보스 | Core Warden | 스테이지 클라이맥스 |

기존 `ship`은 미출시이므로 개명에 따른 데이터 마이그레이션 불필요(구 `ship:*` 기록은
폐기). E2E 하니스의 `data-id="ship"` 단언은 `neonvortex`로 갱신.

## 3. 아키텍처 (규약 준수 — AGENT.md / game-conventions)

`SY.registerGame` 플러그인 패턴, IIFE on `window.SY`, 60fps 핫패스 무할당, React-free
코어. 모듈(`js/games/neonvortex/`):

| 파일 | 책임 |
|---|---|
| `sprites.js` | `ship_assets.png` 아틀라스(완료분 이식) → `SY.nvSprites` |
| `loadout.js` (신규) | `DEFAULT_LOADOUT` 상수 + `resolveLoadout(mode, upgrades)` 해석기 |
| `game.js` | 엔진: phase 상태머신·시뮬·충돌·웨이브 디렉터·어빌리티·보스 → `SY.nvGame` |
| `render.js` | 캔버스 2D 렌더 전용(핫패스) → `SY.nvRender` |
| `main.js` | 등록(`enter/exit/frame/pause/resume`)·HUD·화면·기록·입력 → `SY.registerGame` |
| `tweaks*.jsx` | dev 밸런스 패널(React, 코어 비의존) |

로드 순서(`index.html`): `store → audio → shell → games/neonvortex/{sprites → loadout
→ game → render → main}`. build-standalone가 자동 수집.

**CSS**: Stitch(Tailwind CDN)를 **순수 CSS로 포팅** → `css/neonvortex.css`. 게임 전용
`:root` 오버라이드(design-system.md가 게임별 아트 디렉션 허용). `css/tokens.css` 위에 얹음.
- **폰트**: Sora / Hanken Grotesk / Space Mono를 Google Fonts로 로드, 폴백은 기존
  IBM Plex Mono / system-ui(CDN 실패해도 동작).
- **아이콘**: Material Symbols 대신 **인라인 SVG**(LASER/PULSE/EMP/BOOST/타이머/일시정지)
  — CDN 무의존 원칙.
- **효과**: 스캔라인 오버레이, 헥스그리드 배경, `clip-path` 분절바, skew/chamfer 글래스
  패널, 네온 글로우 — 전부 CSS.

## 4. 데이터 모델 (저장 스키마 — 공정성 격리)

`SY.store.forGame('neonvortex')` 네임스페이스:

| 키 | 내용 | 적립/사용 |
|---|---|---|
| `neonvortex:best_all` | 프리 최고점 | 기존 패턴 |
| `neonvortex:daily_<date>` | 데일리 기록(시드 날짜 귀속, ADR-0004) | 기존 패턴 |
| `neonvortex:bank` (신규) | `{ crystals: number }` 영구 재화 | **모든 모드에서 적립** |
| `neonvortex:upgrades` (신규) | `{ laser, shield, magnet, boost }` 레벨 | **프리플레이 로드아웃에만 반영** |

공용 `settings` 전역은 기존대로.

**공정성 불변식(ADR-0002 확장):**
- 데일리 시뮬은 **항상 `DEFAULT_LOADOUT` 상수**로 실행 → upgrades/재화가 데일리
  **점수**에 영향 0. 동일 시드 = 동일 세계 + 동일 능력치 = 비교 가능.
- 데일리에서 먹은 크리스털은 `bank`에만 적립(진행 보상). 점수/시뮬엔 무영향.
- 프리플레이만 `resolveLoadout('free', upgrades)`로 강화 적용.
- 회귀 테스트: 동일 시드 + 서로 다른 `upgrades` → 데일리 최종 점수·브레이크다운 동일.

## 5. 마일스톤

### M1 — 비주얼 기반 (게임플레이 변경 0, 저위험)
- `css/neonvortex.css`: 디자인 토큰 포팅(팔레트·surface 계열·타이포 스케일), 스캔라인·
  헥스그리드 오버레이, 분절바/글래스/chamfer 유틸, 폰트 로드+폴백.
- 폴더/ id 개명(`ship`→`neonvortex`), 허브 카드 리브랜딩("NEON VORTEX" + accent),
  `index.html` 로드 순서·preload(`ship_assets.png`) 갱신.
- 검증: 기존 동작 불변(허브 카드 진입/복귀), 정적 테스트 갱신, standalone 재빌드.

### M2 — 화면 리스킨 (캔버스 렌더 유지, DOM HUD 오버레이 교체)
- **메뉴(`_1`)**: START / DAILY CHALLENGE / FREE PLAY / RANKING / SETTINGS 행 메뉴
  (기존 records/settings 라우팅 재사용), 버전 푸터, `ARCADE_PILOT_OS` 브랜딩.
- **인게임 HUD(`hud`)**: 분절 HP/SHLD 바, 점수+`COMBO ×N`/`MULT ×N` 글래스 패널,
  타이머 + `WAVE k // STG 1`, Core Warden 보스 바, "WARNING: INCOMING WAVE" 배너,
  레이더 미니맵, 어빌리티 버튼 3 + BOOST(외형만 — 발동은 M3).
- **결과(`_2`)**: TOTAL_SCORE / NEW BEST / CRYSTALS / SURVIVAL / BOSS / PILOT_RANK,
  기존 점수 브레이크다운 버킷("버킷 합 ≡ 총점" 불변식) 유지.
- 검증: E2E 화면 진입/전환, a11y(다이얼로그·aria-live) 유지.

### M3 — 게임플레이 (엔진·핫패스, 고위험)
- **웨이브/스테이지 디렉터**: 기존 surge를 가시적 `WAVE 01..0N`으로 라벨링/연출,
  Core Warden = STG 1 클라이맥스. 타임드 런 유지(**데일리 60초** — 검증된 밸런스 보존).
  멀티 스테이지는 향후 확장으로 명시.
- **어빌리티(쿨다운 액티브)** — 효과 결정론적(rng 미사용 → 공정):
  - `LASER`: 전방 관통빔 버스트(라인 데미지). 쿨다운 ~8s.
  - `PULSE`: 근접 방사 폭발 + 주변 적탄 클리어. 쿨다운 ~12s.
  - `EMP`: 전체 적 스턴 + 보스 공격 잠시 중단(패닉 버튼). 쿨다운 ~20s.
  - `BOOST`: 짧은 대시/속도 버스트(+짧은 i-frame). 쿨다운 ~5s, charge 바 표시.
  - 입력: HUD 버튼 탭(포인터) + 키보드(1/2/3, Space). 모든 전이에서 입력 리셋(ADR-0003).
- **SHLD**: HP와 별개의 분절 흡수층(데일리 고정 base capacity). 피격 시 SHLD 먼저 소모.
- 핫패스 검토: `performance-analyzer` 에이전트(프레임 할당·GC 압력).

### M4 — 진행/경제 (저장·공정성 격리)
- **CRYSTAL_BANK**: 수집 크리스털을 `neonvortex:bank`에 영구 적립.
- **상점(`_3`)**: 업그레이드 트리 — LASER DAMAGE / SHIELD CAPACITY / CRYSTAL MAGNET /
  BOOST SPEED (레벨·비용 곡선). 구매 시 `neonvortex:upgrades` 갱신.
- **SKILLS / LOGS** 화면 + 하단 nav(DASH/SHOP/SKILLS/LOGS). (LOGS = 최근 런/통계,
  최소 구현.)
- 프리플레이 진입 시 `resolveLoadout('free', upgrades)`로 능력치 적용. 데일리는 무시.
- 검증: 공정성 회귀 테스트(§4), 재화 적립/소비, 새로고침 후 영속성.

## 6. 테스트 전략 (마일스톤마다)

- **단위/정적**: `node:test`. 신규 규칙은 `static.test.mjs` tripwire 핀으로 강제.
  점수 상수 ↔ README 동기화(score-sync). `loadout.js` 순수 함수 단위 테스트.
- **공정성**: 동일 시드 + 다른 upgrades → 데일리 점수 동일 (property 테스트).
  spawn/drop이 `s.rng()`만 쓰는지 guard(기존 `guard-seeded-rng` 훅 + rng-fairness-auditor).
- **E2E**: `harness.html` 시나리오 — 화면 진입/전환, 어빌리티 쿨다운 게이팅,
  BOOST charge, 데일리 고정 로드아웃, 재화 격리. 헤드리스 가상시간에선 `G.update(dt)` 수동 스텝.
- **번들**: 변경마다 standalone 재빌드(해시 동기화 검사).
- **검증**: 독립 Verifier에 rubric.md + diff, "위반 방법을 찾아라" 지시(AGENT.md 워크플로).

## 7. 리스크 & 미해결

- **핫패스 회귀(M3)**: 어빌리티/웨이브가 프레임 할당을 늘릴 수 있음 → 사전 풀링,
  performance-analyzer 사후 감사.
- **공정성 누수**: upgrades가 데일리 시뮬에 새지 않도록 단일 진입점(`resolveLoadout`)으로
  강제 + 회귀 테스트.
- **CDN 의존**: 폰트/아이콘은 폴백/인라인으로 무의존 보장(코어 동작 불변식).
- **스코프**: M3가 최대 부담. M1/M2 선출하로 위험 분산.
- **확정 기본값(검토 시 조정 가능)**: 데일리 60초 유지 · 단일 STG 1 시작.

## 8. 다음 단계

본 설계 승인 후 → `writing-plans` 스킬로 **M1 구현 계획**부터 작성(마일스톤별 plan→구현→
검증→출하 사이클). 각 마일스톤 완료 시 ADR 기록(예: 공정성-로드아웃 격리, 어빌리티 시스템).
