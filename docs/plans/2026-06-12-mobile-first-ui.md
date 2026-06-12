# 플랜: 모바일 First UI/UX

- **날짜**: 2026-06-12
- **상태**: 승인됨 → 구현 중
- **승인**: 브레인스토밍 질문 3건 답변 후 설계 승인

## Context

현재 모바일 UX는 사실상 부재: 고정 960×664 스테이지가 세로 폰에서 0.39배 띠(372×257px)로
표시되고, HUD·화면 오버레이가 스테이지와 함께 축소돼 글자가 3~4px가 된다.
**제약**: 데일리 공정성([ADR-0002](../adr/0002-seeded-rng-daily-fairness.md)) 때문에
논리 아레나는 960×600 고정 — `js/game.js`는 변경하지 않는다.

### 브레인스토밍 확정 사항

| 질문 | 선택 |
|---|---|
| 세로 모드 | **세로 플레이 지원** — 폭 맞춤 아레나(상단) + 하단 전용 터치 영역 (오브젝트 축소 트레이드오프 수용) |
| 몰입 요소 | HUD 오버레이화 + 풀스크린 버튼(시작 시 자동 요청 포함) + PWA 메타 + 햅틱 **전부** |
| 화면 재배치 | **전부 반응형** (메뉴/결과/일시정지/안내, safe-area 포함) |

## 핵심 설계: 스케일되는 캔버스 / 스케일 안 되는 UI 분리 → [ADR-0006](../adr/0006-mobile-first-scaled-canvas-unscaled-ui.md)

- `#stage` = `<canvas>` + `#crt`만 (논리 960×**600**, HUD 64px 제거)
- HUD·4개 화면·조이스틱·버튼은 뷰포트 레벨 fixed DOM — CSS 반응형, 스케일 무관

## 변경 내역

### index.html
- `#hud`·`.screen` 4개를 `#stage` 밖(#viewport 직속)으로 이동, `#touch-zone` 신설
- `#btn-fullscreen`(⛶) 추가, 일시정지 화면에 `#btn-haptic` 토글
- head: `viewport-fit=cover`, manifest 링크, theme-color, apple-touch-icon, favicon(svg)

### css/style.css (레이아웃 전면 재작성)
- `body.portrait` / `body.landscape` 클래스 분기 (fit()이 부여)
- 세로: HUD 솔리드 바(상단) → 아레나(폭 맞춤) → `#touch-zone`(잔여 하단, 힌트 텍스트)
- 가로: 아레나 contain-fit 중앙, HUD 반투명 오버레이 (데스크탑 동일)
- `.screen`: fixed inset 0 + `env(safe-area-inset-*)` + overflow-y auto, 모드 카드 flex-wrap,
  spark 캔버스 CSS 폭 `min(320px, 86vw)`, 폰트 `clamp()`
- 우상단 버튼(음소거/일시정지/풀스크린): 모바일에서 축소(38px), HUD가 우측 여백 확보

### js/main.js
- `fit()` 재작성: visualViewport 기준, orientation 클래스 부여, transform-origin 0 0 +
  translate/scale 계산, 세로에서 `#touch-zone` top = 아레나 하단
- 조이스틱 pointerdown 대상 `#stage` → `#viewport` (터치 영역 포함, phase 가드 유지)
- 풀스크린 토글 + `reallyStart`에서 coarse-pointer 기기 자동 요청(제스처 편승, 실패 무시),
  미지원 기기(iOS iPhone)에서 버튼 숨김
- 햅틱 설정 로드/토글 와이어링 (`settings.haptics`, 기본 on)

### js/audio.js
- `buzz(pattern)` — `navigator.vibrate` 가드 + 설정 게이트. hit/shieldPop/bossDown/gameOver에 연결
- `SY.audio.setHaptics/hapticsOn` (setMuted와 동일 패턴 — 기존 테스트 Proxy 스텁과 호환)

### PWA 자산
- `manifest.json` (fullscreen, any orientation, theme #04090f) + `icons/`(svg + 512/192/180 png —
  헤드리스 Edge 스크린샷으로 생성). 서비스 워커는 제외(YAGNI — 오프라인은 standalone.html 담당)

### 테스트
- E2E 신규 시나리오: iframe 리사이즈로 세로(390×700)/가로(700×390) 에뮬레이션 —
  body 클래스, 터치 영역 표시, 스테이지 스케일(≈0.406), 메뉴 카드 적층 assert
- 기존 49건 + tripwire 전부 그린 유지, `js/game.js` 변경 0이 회귀 안전망

## Verification
`test\run-all.ps1` ALL PASS + 헤드리스 스크린샷(세로 메뉴/세로 플레이/가로 플레이) 시각 확인
+ standalone 재빌드 해시 동기화.
