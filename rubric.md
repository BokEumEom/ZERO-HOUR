# Verifier Rubric — Scoreyard 상시 평가 기준

이 프로젝트의 **모든 코드 변경**에 적용하는 Verifier Sub-Agent용 상시 루브릭.
특정 작업용 스냅샷은 [docs/rubrics/](docs/rubrics/)에 날짜를 붙여 보관한다
(예: [2026-06-11 완성도 업그레이드](docs/rubrics/2026-06-11-completeness-upgrade-rubric.md)).

## 사용법

1. 구현 완료 후 독립 Verifier(구현 컨텍스트 미공유)에게 이 루브릭 + 변경 diff를 전달
2. Verifier는 **모든 검증을 직접 실행**하고, 각 기준을 "위반하는 방법"을 적극적으로 탐색
3. Critical 1건이라도 실패 시 전체 FAIL → Refiner가 반영 후 재평가
4. 통과선: **24/27 이상 + Critical 전원 통과**

## 검증 명령

```powershell
node --test "test/unit/*.test.mjs"                                      # 단위 + 정적 (의존성 0)
powershell -NoProfile -ExecutionPolicy Bypass -File test\e2e\run.ps1    # E2E (헤드리스 Edge)
powershell -NoProfile -ExecutionPolicy Bypass -File test\run-all.ps1    # 전체 + 번들 해시 동기화
git diff <base>..HEAD -- js/ index.html css/                            # 핫패스·규칙 diff 분석
```

## Rubric

| 번호 | 기준 | 검증 방법 | Weight |
|---|---|---|---|
| 1 | **상태머신 정확성** — phase 전이(`menu\|ready\|playing\|paused\|over`)가 명세대로, paused 중 시뮬·점수·타이머·코스메틱 완전 동결, `pausedFrom` 복원 | `test/unit/game.test.mjs` 동결·전이 테스트 + E2E pause 시나리오 통과 | Critical=3 |
| 2 | **기록 무결성** — QUIT/중도 포기 런은 `onGameOver` 미호출·IndexedDB 미변경, 정상 종료만 기록 | E2E quit 시나리오 (spy 0 + `loadAll()` 불변) | Critical=3 |
| 3 | **점수 브레이크다운 무결성** — 4버킷(crystals/combo/destruction/boss) 합 ≡ 최종 score, ×2 구간 포함. 신규 가산 경로는 반드시 버킷 태깅 | 시드 런 property 테스트 (2모드 × 3시드) + E2E 비자명 합산(score>0) | Critical=3 |
| 4 | **입력 누수 방지** — 모든 phase 전이 지점(`pause`/`resume`/`start`)에서 키·조이스틱 리셋, blur keyup 유실 대응 | stuck-key 단위 테스트 4건 + E2E 조이스틱 assert | High=2 |
| 5 | **시간·날짜 정확성** — UTC 경계(월/연/자정) 안전, 데일리 기록은 **시드 날짜로 귀속**([ADR-0004](docs/adr/0004-daily-records-filed-by-seed-date.md)), streak 자가 치유 | store 픽스처 테스트 + E2E rollover 시나리오 (todayUTC 오버라이드) | High=2 |
| 6 | **60fps 핫패스 무회귀** — `update()`/`render()` 프레임 루프에 신규 할당(객체/배열/클로저)·DOM 조회 0건 | diff 정적 분석 + performance-analyzer 에이전트 Critical 소견 0건 | High=2 |
| 7 | **리소스 누수 방지** — setInterval/setTimeout 핸들 단일·중앙 정리, 리스너 중복 바인딩 0건 | E2E 화면 전환 반복 후 정리 assert + 신규 타이머는 `show()` 정리 경로 편입 확인 | High=2 |
| 8 | **코어 패턴 준수** — `node --check` 통과, IIFE + `window.SY`, 코어 5모듈 React-free, 게임플레이 난수는 `s.rng()`만([ADR-0002](docs/adr/0002-seeded-rng-daily-fairness.md)) | `test/unit/static.test.mjs` tripwire (Math.random ≤14 등 베이스라인 핀) | High=2 |
| 9 | **innerHTML 주입 안전성** — 싱크 개수 핀(현재 3) 유지, 삽입 값은 숫자·고정 enum·`fmt()` 산출물만, 저장 데이터는 타입 강제 | `static.test.mjs` 싱크 핀 + 삽입 변수 출처 정적 추적 | High=2 |
| 10 | **E2E 재현성** — 전 시나리오(howto/quit/pause/over/rollover + 신규 기능 시나리오) 무인 통과, **자명 통과 금지**(assert는 비자명 입력 위에서, 리포트에 실측값 포함) | `test\e2e\run.ps1` exit 0 + 리포트 디테일 검토 | Critical=3 |
| 11 | **관심사 분리** — render.js는 게임 캔버스 전용, UI는 main.js, 스타일은 css/style.css 단일 출처(인라인 style ≤6), CSS 기본 `display:none` 요소는 JS에서 표시 값 명시 | `static.test.mjs` 분리·예산 가드 | Medium=1 |
| 12 | **빌드 산출물 동기화** — `standalone.html`은 fresh build와 해시 일치([ADR-0001](docs/adr/0001-dual-html-generated-standalone.md)), 직접 수정 금지 | `run-all.ps1` 해시 비교 PASS | High=2 |

**배점**: Critical 4개(12) + High 7개(14) + Medium 1개(1) = 27점 만점.

## 신규 기능 추가 시 Verifier 체크리스트

- [ ] 새 가산 경로 → #3 버킷 태깅 + property 테스트 시드 확장
- [ ] 새 화면/오버레이 → #1 전이표 갱신, #7 정리 경로, #11 visibility 가드(phase 아닌 DOM)
- [ ] 새 타이머/리스너 → #7 중앙 정리 편입
- [ ] 새 난수 → #8 `s.rng()` 여부 + tripwire 베이스라인 갱신(공정성 리뷰 첨부)
- [ ] 새 innerHTML/저장 데이터 → #9 싱크 핀 갱신 + 타입 강제
- [ ] "지금 시각" 의존 로직 → #5 경계 픽스처 + rollover 시나리오 확장
- [ ] 소스 변경 → #12 `/build-standalone` 재생성
