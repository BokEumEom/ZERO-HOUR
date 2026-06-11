# Verifier Rubric: Scoreyard 완성도 업그레이드

- **날짜**: 2026-06-11
- **대상 작업**: [완성도 업그레이드 플랜](../plans/2026-06-11-completeness-upgrade.md) 구현분
  (일시정지 시스템, 결과 화면 브레이크다운·스파크라인·카운트다운, 데일리 streak/히스토리, CSS 분리)
- **평가 결과**: [Verifier 보고서](../reviews/2026-06-11-verifier-report.md)

## 원칙
- 모든 기준은 객관적·자동 검증 가능
- Critical 1건이라도 실패 시 전체 FAIL
- 커버 영역: 기능 정확성, 에지 케이스, 성능, 코드 품질, 보안, 테스트 전략, 아키텍처, 구조적 개선

## Rubric

| 번호 | 기준 | 검증 방법 | Weight |
|---|---|---|---|
| 1 | **일시정지 상태머신 정확성** — `G.pause()`는 `playing\|ready`에서만 동작, `paused` 중 시뮬레이션·점수·타이머·파티클 완전 동결, `G.resume()`은 `pausedFrom` 복원 | 하니스: 게임 시작 → pause → 상태 스냅샷 → 가상 2초 + `G.update()` 수회 → 불변 assert, phase 전이 시퀀스 assert | Critical=3 |
| 2 | **QUIT 무기록 보장** — 일시정지 → QUIT 시 `onGameOver` 미호출, IndexedDB `best_all`/`daily_<date>` 미변경 | 하니스: 점수 획득 후 quit → `loadAll()` deep-equal assert, onGameOver spy 호출 0 | Critical=3 |
| 3 | **점수 브레이크다운 무결성** — 4버킷 합계 ≡ 최종 `score` (×2 구간 포함) | ×2 포함 시드 런 완주 → 합산 assert (3개 시드 × 2모드 property 테스트) | Critical=3 |
| 4 | **입력 누수 에지 케이스** — blur 자동 일시정지 시 keyup 유실, 드래그 중 일시정지 시 입력 잔류 없음 | keydown dispatch → pause → resume → keys/`SY.input` 초기화 assert, 드래그 중 pause → 조이스틱 해제 assert | High=2 |
| 5 | **UTC 경계·streak 계산 정확성** — 오늘 미기록+어제 기록 시 streak 유지, 월/연 경계 정상, 연속 끊김 시 정확히 절단 | IndexedDB 스텁으로 store.js 단위 테스트: 4개 픽스처에서 `computeStreak()`/`loadRecentDailies(7)` 기대값 assert | High=2 |
| 6 | **60fps 핫패스 무회귀** — `update()`/`render()` 프레임 루프에 신규 할당·작업 0 | `git diff` 정적 분석: 프레임 경로 내 신규 객체/배열/클로저 0건, performance-analyzer Critical 소견 0건 | High=2 |
| 7 | **타이머·리스너 누수 방지** — 카운트다운 `setInterval` 단일 핸들, `screen-over` 이탈 시 항상 해제 | 하니스: over → RETRY → over → MENU 반복 후 핸들 정리 assert | High=2 |
| 8 | **구문·코어 패턴 준수** — 전 모듈 파싱 통과, IIFE + `window.SY` 유지, 코어 5모듈 React 0건, 시드 RNG 규칙 | `node --check` && React grep 공집합 && 게임플레이 `Math.random()` 신규 사용 0건 | High=2 |
| 9 | **innerHTML 주입 안전성** — 싱크에 삽입되는 값이 숫자·고정 enum·`fmt()` 산출물로 타입 보장 | innerHTML 전 호출처 정적 추적, free-form 문자열 0건, title 값 포맷 assert | High=2 |
| 10 | **E2E 시나리오 재현성** — menu/howto/pause/over 시나리오 단일 스크립트 무인 통과 | 헤드리스 하니스 일괄 실행 → assertion 전부 통과 시 exit 0 | Critical=3 |
| 11 | **관심사 분리 유지** — 캔버스 렌더링 render.js 전용(스파크라인은 main.js), 스타일은 css/style.css 단일 출처, 인라인 style 금지 | `<style` grep 0, `over-spark` in render.js 공집합, inline style 예산 | Medium=1 |
| 12 | **빌드 산출물 동기화** — `standalone.html` 재생성 시 diff 없음 (CSS 인라인 포함) | fresh build → 해시 비교, `inlined: css/style.css` 마커 존재 | High=2 |

**배점**: Critical 4개(12) + High 7개(14) + Medium 1개(1) = **27점 만점**, 통과선 24/27 권장 + Critical 전원 통과 필수.

## 루브릭 → 테스트 매핑 (구현 결과)

| 기준 | 자동 테스트 |
|---|---|
| 1 | `test/unit/game.test.mjs` (동결·전이·readyT·hitstop 5건) + E2E quit 시나리오 |
| 2 | `game.test.mjs` (toMenu spy) + E2E quit 시나리오 (IndexedDB 검증) |
| 3 | `game.test.mjs` (property 6런 + ×2 분배 + 보스) + E2E 비자명 합산 (score=348) |
| 4 | `game.test.mjs` (stuck key 3건 + G.start 리셋) + E2E 조이스틱 |
| 5 | `test/unit/store.test.mjs` (픽스처 4종 + 월/연 경계 + 포맷) |
| 6 | Verifier diff 분석 (수동) — 신규 프레임 할당 0건 확인 |
| 7 | E2E (RETRY 후 카운트다운 정리) |
| 8 | `test/unit/static.test.mjs` (React/IIFE/RNG 베이스라인) + 모듈 로드 자체가 파싱 검증 |
| 9 | `static.test.mjs` (싱크 개수 핀 3 + title 포맷) + `store.test.mjs` (날짜 포맷) |
| 10 | `test/e2e/run.ps1` exit 0 (26 assertions, 5 시나리오) |
| 11 | `static.test.mjs` (style 블록 0 + inline style ≤6 + sparkline 위치) |
| 12 | `test/run-all.ps1` (fresh build 해시 비교) |
