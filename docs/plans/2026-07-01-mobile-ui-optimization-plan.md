# 모바일 UI/UX 최적화 — 계획

- **상태**: 진행 중 (자율 루프, `/goal` 지시에 따름)
- **작성일**: 2026-07-01

## 조사 방법

정적 CSS 리딩만으로는 신뢰도가 낮아(Explore 에이전트의 1차 리포트 중 최소 1건이
실제로는 존재하는 E2E 커버리지를 "없다"고 오판) Playwright + 실제 Chrome으로
iPhone SE(375×667) / iPhone 14(390×844) / 소형 Android(360×800) / 가로(667×375)
뷰포트에서 전체 화면(메뉴/HUD/설정/랭킹/하우투/일시정지/게임오버/격납고/업그레이드/
업적/파일럿로그)을 스크린샷 + `getBoundingClientRect` 실측으로 검증했다.

## 확정된 문제 (근본 원인까지 특정, 우선순위순)

### P1 — 게임오버 화면: 핵심 재도전 CTA가 스크롤 없이 안 보임
- **증상**: iPhone SE에서 RETRY/COPY RESULT/MENU 버튼에 도달하려면 **381px 스크롤**
  필요 (`.panel` scrollHeight 966 vs 표시 587px). 60초마다 반복되는 코어 루프 화면.
- **원인**: DOM 순서가 `점수 → 랭크 → 메타 → 배너 → 메달 → 8칸 스탯 그리드 →
  스파크라인 → 버튼 → 카운트다운`으로, 버튼이 상세 통계 뒤에 배치됨.
- **수정**: `index.html`에서 `.btn-row` + `#neonvortex-over-countdown` +
  개인정보 문구를 베스트 배너 직후(메달/스탯/스파크라인 앞)로 이동. JS는 전부
  `getElementById` 참조라 DOM 순서 의존 없음(확인 완료) — 순서만 바꾸면 안전.

### P2 — 설정/랭킹 화면: 헤더 상태 텍스트가 코너 버튼과 겹침
- **증상**: `.nv-set-status`("SETTINGS_CONSOLE_OK") / `.nv-rank-status`가 고정
  코너 버튼(음소거/전체화면, `position:fixed; z-index:70`)과 실측 좌표가 겹침
  (세로 7px + 가로 영역 겹침 확인). 스크린샷상 텍스트가 버튼 뒤로 잘림.
- **원인**: `.nv-rank-head`/`.nv-set-head`가 우측 여백을 예약하지 않음 — HUD는
  `padding-right: calc(safe-right + 158px/138px)`로 동일 문제를 이미 해결한 패턴이
  있으나 이 두 화면 헤더에는 적용 안 됨.
- **수정**: `.nv-rank-head`/`.nv-set-head`에 코너 버튼 폭만큼 우측 패딩 예약 +
  `.nv-rank-status`/`.nv-set-status`에 `text-overflow:ellipsis` 안전망 추가.

### P3 — 랭킹 화면: 스코어 컬럼이 뷰포트 우측 밖으로 잘림
- **증상**: `#neonvortex-records-body`가 실제 컨테이너(`.nv-rank-shell` 콘텐츠
  박스, 309px)보다 넓은 345px로 렌더 → 리더보드 SCORE 헤더 + "TCE_ANL_V3" 배지가
  뷰포트 밖으로 잘림(실측: `right: 377.875` vs `innerWidth: 375`).
- **원인**: `css/neonvortex.css:440`의 **레거시(허브 시대) 규칙**
  `#neonvortex-records-body { width: min(360px, 92vw); ... }`이 현재
  `.nv-rank-shell` 기반 레이아웃(`css/neonvortex.css:1471`, width 미지정)에
  캐스케이드로 새어 들어옴. `:1471` 규칙이 `width`를 지정 안 해서 구식 규칙이 이김.
- **수정**: `:440`의 죽은 규칙 제거(현재 셸 구조와 완전히 충돌·중복).

### P4 — 터치 조이스틱이 화면 경계에서 잘려 보임
- **증상**: `positionStick()`(`js/games/neonvortex/main.js`)이 조이스틱 원(지름
  110px) 중심을 pointerdown 좌표에 그대로 배치, 클램핑 없음. ADR-0006이 "화면
  어디서나 드래그"를 의도적으로 허용하므로 화면 가장자리 터치가 실제로 발생함.
- **영향**: 입력 델타 계산(`SY.input.ax/ay`)은 영향 없음(시각 요소만 문제) —
  기능 버그 아님, 시각적 혼란만 유발.
- **수정**: `positionStick`에서 원 중심 좌표를 `[55, innerWidth-55]` /
  `[55, innerHeight-55]`로 클램프.

## 범위 밖 (조사했으나 실증 실패 / 낮은 임팩트)

- Explore 에이전트가 보고한 "HUD 버튼 3개 동시 표시로 158px 패딩과 충돌" — 실측상
  최대 2개만 동시 표시되고 여유 48px 있음. 실제 충돌 아님.
- "E2E에 모바일 뷰포트 테스트 없음" — 오판. `test/e2e/harness.html` 시나리오 6이
  이미 390×844 세로 회전을 검증함.
- 메뉴/게임오버 패널의 `overflow-y:auto` 스크롤 자체는 정상 동작 확인(스크롤 안내
  아이콘 부재는 저심각도 폴리시로 보류).

## 검증 계획

1. `test/e2e/harness.html`에 P2/P3 회귀 가드 추가: 설정/랭킹 화면을 좁은 뷰포트
   iframe에서 열고 (a) 상태 텍스트와 코너 버튼의 bounding rect가 겹치지 않음,
   (b) records-body가 뷰포트 폭을 넘지 않음을 assert.
2. `node --test test/unit/*.test.mjs` — 전체 그린 유지.
3. `test/run-all.ps1` (또는 WSL에서 동등 절차: 단위 + E2E headless Edge/Chrome +
   번들 해시 동기화) ALL PASS.
4. Playwright 스크린샷 재캡처(iPhone SE/14, Android, 가로)로 4건 모두 시각 확인.
5. `standalone.html` 재생성 + 해시 동기화 확인.

## 롤백 트리거

P1(DOM 순서 이동)이 포커스/키보드 단축키(R/M) 흐름을 깨뜨리면 즉시 원복 후 재설계.
