# 플랜: Scoreyard 완성도 업그레이드 — 일시정지·결과 화면·메뉴 시스템

- **날짜**: 2026-06-11
- **상태**: ✅ 구현 완료 (commit `cdf9b88`), 검증 완료 (commit `dd98ea9`)
- **승인**: 사용자 브레인스토밍 후 플랜 모드 승인

## Context

게임에 부족한 시스템 검토 결과, 사용자와 브레인스토밍으로 확정한 6개 기능을 추가한다:
일시정지가 전혀 없고(게임 중 이탈 수단이 새로고침뿐), 결과 화면이 단순하며, 반복 플레이를
유도하는 장치(streak·히스토리·카운트다운)가 없다.

### 브레인스토밍에서 확정된 스코프 (사용자 선택)

| 질문 | 선택 |
|---|---|
| 일시정지 범위 | **풀 패키지** — ESC/P + 모바일 버튼 + 탭/블러 자동 일시정지 + RESUME/RESTART/QUIT |
| QUIT 시 기록 | **기록 안 함** — 중도 포기 런은 폐기 (아케이드 관례) |
| 결과 화면 | 점수 그래프(pace 스파크라인) + 점수 브레이크다운 + 다음 데일리 카운트다운 (Web Share 제외) |
| 기타 완성도 | 재시작·메뉴 단축키 + 첫 방문 조작 안내 + 데일리 streak·히스토리 (favicon/OG 제외) |

## 변경 파일별 설계

### 1. js/game.js
- phase `'paused'` 추가: `G.pause()`(playing|ready에서만, `pausedFrom` 저장, `resetKeys()` + `SY.input` 0),
  `G.resume()`(복원 + resetKeys 재호출 — 오버레이 중 키 누수 방지)
- `update(dt)`: `if (!s) return;` 직후 paused 조기 return — 시뮬·코스메틱 완전 동결.
  hitstop `s.freeze`는 playing 경로에서만 감소하므로 그대로 안전. dt 클램프(1/30)로 재개 시 시간 점프 없음
- 브레이크다운 버킷: `freshState`에 `breakdown: {crystals, combo, destruction, boss}`,
  `addScore`에 `bucket` 인자 — crystal은 `10*mul`/`(base-10)*mul`로 분리(×2 반영).
  호출처 태깅: 크리스털 `'crystal'`, 기뢰·바위 `'destroy'`, 보스 명중·격파 `'boss'`.
  `endGame` res에 `breakdown` 포함. 버킷 합 = 최종 점수 보장

### 2. js/store.js
- `utcDateMinus(n)` — `Date.UTC` 산술 (월/연 경계 안전)
- `SY.store.loadRecentDailies(n)` — `daily_<date>` n개, `[{date, rec|null}]` 최신순
- `SY.store.computeStreak()` — 오늘 미기록 시 어제부터(당일 유예), 연속 카운트, 365 캡, 무저장 카운터(자가 치유)

### 3. index.html (+ css/style.css)
- `#screen-pause` (PAUSED 타이틀, RESUME/RESTART/QUIT 버튼), `#screen-howto` (조작·목표·보스 안내 + START)
- `#screen-over`에 `<canvas id="over-spark" 320×60>` + `#over-countdown`
- 메뉴: `#menu-streak`(데일리 카드), `#menu-week`(7칸 .day-cell)
- `#btn-pause` — `#btn-mute` 옆 fixed(스테이지 스케일 밖 → 모바일 탭 안정), 플레이 중에만 표시

### 4. js/main.js (최대 변경)
- `show()` 목록 확장 + screen-over 이탈 시 `stopCountdown()` (인터벌 정리 중앙화)
- `pauseGame()`/`resumeGame()` — 조이스틱 강제 해제(`releaseStick()`) 포함
- 자동 일시정지: `visibilitychange`(hidden) + `window blur` (phase 가드로 메뉴/오버에서 무해)
- 통합 keydown 분기 순서: ① over visible(R/Enter retry, M/Esc menu — phase 아닌 **DOM visible** 체크,
  화면은 650ms 지연 표시) ② howto visible(Enter/Space) ③ paused(Esc/P resume) ④ playing|ready(Esc/P pause)
- `drawSparkline(pace, bestPace)` — main.js 소속(render.js는 게임 캔버스 전용 유지).
  `runBestPace`는 런 시작 전 캡처라 베스트 갱신 후에도 올바른 비교 대상
- 카운트다운: 다음 UTC 자정까지 HH:MM:SS, 단일 핸들, show()에서 중앙 정리
- 첫 방문 게이트: `startGame` → 게이트 + `reallyStart` 분리, `seenHowto`는 START 클릭 시 저장
- `renderDailyHistory()` — streak + 7칸, boot/onGameOver/메뉴 복귀 시 호출

### 5. 마무리
- standalone.html 재생성 (`/build-standalone`), README 갱신, 커밋 (push 시 Vercel 자동 배포)

## 엣지 케이스
ready 중 일시정지 허용(readyT 연속), hitstop 동결 보존, blur keyup 유실 → resetKeys,
드래그 중 일시정지 → 조이스틱 해제, Esc 다중 역할 → keydown 분기 순서, 인터벌 누수 → show() 중앙 정리,
streak UTC 경계 + 오늘/어제 앵커, 데일리 첫 런 스파크라인 단독, 브레이크다운 합 ≡ 점수.

## Verification (실행 결과)
- 헤드리스 Edge 스크린샷 4종 (menu/howto/pause/over) — 시각 확인 완료
- 이후 루브릭 기반 자동 테스트로 격상: 단위·정적 31/31 + E2E 26/26
  ([검증 보고서](../reviews/2026-06-11-verifier-report.md) 참조)

## 구현 중 발견 (플랜과의 차이)
- 헤드리스 가상 시간에서 rAF 굶음 → E2E는 `G.update()` 수동 스텝으로 전환
- `#btn-pause`/`#menu-week`: CSS 기본 `display:none` + JS `''` 복원 충돌 → `'block'` 명시
- 검증 단계에서 자정 롤오버 통합 버그 발견 → [ADR-0004](../adr/0004-daily-records-filed-by-seed-date.md)로 해결
