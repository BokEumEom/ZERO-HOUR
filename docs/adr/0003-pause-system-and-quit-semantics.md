# ADR-0003: 일시정지 시스템과 QUIT 무기록 의미론

- **상태**: 적용됨 (2026-06-11, commit `cdf9b88`)
- **관련**: [완성도 업그레이드 플랜](../plans/2026-06-11-completeness-upgrade.md)

## Context

게임 중 이탈 수단이 새로고침뿐이었다. 일시정지를 추가하려면 결정할 것:
상태머신 형태, 입력 처리, 자동 일시정지 범위, 그리고 중도 포기한 런의 기록 처리.

## Decision

### 상태머신
- phase에 `'paused'` 추가 (`menu | ready | playing | paused | over`). `G.pausedFrom`에
  이전 phase를 저장해 ready 중 일시정지도 ready로 복원 (readyT는 멈췄다 이어짐).
- `update()` 최상단 조기 return으로 시뮬·코스메틱·hitstop **완전 동결**.
  rAF 루프는 계속 돌며 동결 프레임을 그림 — DOM 오버레이가 위를 덮는 구조라 무해.
- 트리거: ESC/P 키, 모바일 `II` 버튼(스테이지 스케일 밖 fixed — 탭 좌표 안정),
  `visibilitychange`(hidden) + `window blur` 자동 일시정지 (phase 가드로 어디서든 안전).

### 입력 누수 방어 (일시정지의 실제 난점)
모든 전이 지점에서 입력 리셋: `pause()`(blur로 keyup 유실 대비), `resume()`(오버레이 중
눌린 키 폐기), **`start()`**(메뉴에서 stuck된 키가 새 런 조종 방지 — Verifier 적발),
`pauseGame()`에서 조이스틱 강제 해제.

### QUIT = 무기록
- 중도 포기 런은 점수·베스트에 반영하지 않는다 (아케이드 관례, 사용자 선택).
- 구현은 플래그가 아니라 **경로 분리**: QUIT은 `endGame()`을 경유하지 않고 `G.toMenu()` 직행
  → `onGameOver` 미호출·저장 미발생이 구조적으로 보장. 테스트는 spy 호출 0 + IndexedDB 불변으로 검증.
- 데일리 재도전 허용은 기존 RETRY 의미론과 동일 (같은 시드 재시작 가능).

### 단축키 가드
게임오버 화면은 phase 전환 650ms 후 표시되므로, over 단축키(R/Enter/M/Esc)는
phase가 아닌 **DOM visibility**(`classList.contains('visible')`)로 가드.
Esc의 다중 역할은 keydown 분기 순서(over > howto > paused > playing)로 해소.

## Consequences

- (+) 기록 오염 불가능한 구조, stuck-input 에지 전부 테스트로 고정
- (−) 일시정지 중 정지 화면 관찰("스카우팅")이 가능 — 캐주얼 게임 수준에서 수용
