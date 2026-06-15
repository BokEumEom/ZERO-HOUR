# 플랜: 60초 + RECORDS 화면 + 아레나 UX 향상

- **날짜**: 2026-06-15
- **상태**: ✅ 구현·검증 완료
- **승인**: AskUserQuestion 2건(기록 메뉴=전용 RECORDS 화면, 아레나 UX=4개 전부)

## 범위

1. **게임 시간 75→60초**
2. **전용 RECORDS 화면** (홈에서 기록 열람 — 모바일 hover 불가 문제 해소)
3. **아레나 UX 4종**: 효과 타이머 배지 · 일시정지/HUD 정리 · 저체력 위험 연출 · 보스 HP바 DOM화

## 변경 내역

### 1. 60초
- `js/game.js` `SY.tweaks.duration` 75→60. 보스 타이밍 무변경(`timeLeft<=20` & `duration>=40` 유지 → 40초 경과 시 등장).
- `js/tweaks.jsx` `TWEAK_DEFAULTS.duration` 75→60 (슬라이더 min 60 그대로).
- 텍스트: `index.html`(hud-time 기본값, 메뉴 "60초", howto "60 seconds"), README/CLAUDE/AGENT/design "75초→60초".

### 2. RECORDS 화면
- `index.html`: 홈에 `#btn-records`(메뉴 카드 아래), `#screen-records` 오버레이(.screen — 타이틀 + `#records-body` + BACK).
- `js/main.js`: `show()`에 'screen-records' 추가. `renderRecords()` async — `recs.bestAll` + `loadRecentDailies(14)` + `computeStreak()`로 빌드:
  올타임 베스트(점수·×콤보·날짜·모드), STREAK, 최근 14일 리스트(MM-DD · 점수 · 보스 ✦, 없는 날은 dim). `#btn-records`→렌더+show, `#btn-records-back`→메뉴. keydown: records 표시 중 Esc/M→메뉴. innerHTML 값은 전부 `fmt()`/고정 포맷(주입 안전 #9).
- `js/store.js`: 변경 없음(`loadRecentDailies(14)` 재사용).

### 3. 효과 타이머 배지
- `js/main.js`: `POWER_DUR = {MAGNET:7,SLOW:5,X2:7,BOOST:6,SPREAD:7}`. `chip(meta, secs, max)` → 글리프 + 잔여시간 바(`width:secs/max%`, 인라인). SHIELD는 바 없는 글리프. updateHud에서 각 활성 fx에 max 전달.
- `css`: `.fx-badge`(세로 글리프+바, `--c` 색), `.fx-glyph`, `.fx-bar`/내부 fill.

### 4. 일시정지 / HUD 정리
- 플레이 중(`playing|ready`) 상단은 **일시정지 버튼 하나만**. 음소거·풀스크린 버튼은 숨김.
- 일시정지 오버레이(`#screen-pause`)에 SOUND·FULLSCREEN 토글 추가(기존 VIBRATION 옆) — 일시정지 = 설정 허브.
- `updateHud`: `inGame=playing||paused`면 mute/fs 숨김, 메뉴/오버에서 표시. pause 버튼은 playing에서만.
- 새 버튼 `#btn-pause-mute`/`#btn-pause-fs` 와이어링(기존 토글 로직 재사용, 라벨 동기화).

### 5. 저체력 위험 연출
- `index.html`: `#danger-vignette`(저체력 적색 가장자리 펄스), `#hit-flash`(피격 순간 적색 플래시) — 둘 다 fixed, pointer-events none.
- `js/main.js` updateHud: `lastHp` 추적 → hp 감소 시 hit-flash 애니메이션 재시작; `playing && hp<=1`이면 vignette `.active`. 상태 변화 시에만 토글(프레임당 중복 쓰기 회피). 새 런에서 lastHp 리셋.
- `css`: `dangerPulse`/`hitFlash` 키프레임.

### 6. 보스 HP바 DOM화
- `index.html`: `#boss-hp`(라벨 "CORE WARDEN" + 트랙 + fill), fixed, HUD 아래 중앙, 기본 숨김.
- `js/render.js`: `drawBoss`의 in-canvas HP바 블록 제거(세로에서 옆으로 눕던 것 해소). 보스 본체 그리기는 유지.
- `js/main.js` updateHud: `s.boss && dying<=0`면 표시 + fill width=hp/maxHp, 아니면 숨김.
- `css`: `#boss-hp` 배치/스타일(핑크).

## 테스트
- 단위: duration 기본값 60 회귀 없음(대부분 명시 override). 새 로직은 주로 DOM/E2E.
- E2E 신규: RECORDS 열람(올타임 베스트 행·14일 리스트), 효과 배지(파워업 적용 후 바 존재), 플레이 중 mute/fs 숨김·pause 표시, 보스 HP DOM 표시. 기존 시나리오 그린 유지.
- Playwright 라이브: 세로에서 RECORDS·배지·일시정지 메뉴·저체력 비네트·보스 HP 시각 확인.

## Verification
`test\run-all.ps1` ALL PASS + standalone 재빌드 해시 동기화 + 헤드리스/Playwright 스크린샷.
결정 기록: [ADR-0007](../adr/0007-records-screen-and-arena-hud.md).
