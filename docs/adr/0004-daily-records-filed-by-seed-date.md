# ADR-0004: 데일리 기록은 런의 시드 날짜로 저장

- **상태**: 적용됨 (2026-06-11, commit `dd98ea9`)
- **관련**: [Verifier 보고서 P1](../reviews/2026-06-11-verifier-report.md)

## Context

`recs.today`(현재 UTC 날짜)는 부팅 시 1회 캐시되는데, 결과 화면의 "NEXT DAILY IN"
카운트다운은 사용자를 자정 너머까지 대기하도록 **유도**한다. 자정 후 RETRY하면:
새 날짜 시드로 플레이한 런이 캐시된 어제 키(`daily_<어제>`)에 저장돼 streak이 끊기고,
페이스 비교 대상도 어제의 베스트로 어긋난다. 독립 Verifier가 적발한 통합 레벨 버그.

## Decision

1. **기록의 귀속은 "지금 날짜"가 아니라 런의 시드 날짜**: `endGame` 결과에 `seedStr`을
   포함시키고, `onGameOver`는 `res.seedStr.slice('daily-'.length)`를 저장 키로 사용.
   데이터가 자신의 출처(어느 날의 맵이었는지)를 들고 다닌다.
2. **경계 이벤트마다 슬레이트 동기화** (`syncToday()`): 런 시작(`reallyStart` — 어제
   베스트와 페이스 비교 방지), 게임 오버 후, 카운트다운 0초 도달 시. 날짜가 바뀌었으면
   `recs.today` 갱신 + `recs.dailyBest = null` + 메뉴 갱신.
3. 카운트다운이 자정에 도달하면 23:59:59로 되감지 않고 **"NEW DAILY READY!"** 표시 후 정지.
4. 자정을 걸친 in-flight 런(어제 시드로 시작, 오늘 종료)은 시드 날짜(어제) 키로 정상 귀속 —
   다른 맵에서 딴 점수가 오늘의 기록으로 둔갑하지 않는다.

## Consequences

- (+) streak·페이스 비교·기록 귀속이 자정 경계에서 전부 정확
- (+) E2E rollover 시나리오(`SY.todayUTC` 오버라이드)로 회귀 방지
- (교훈) 기능 추가는 기존 가정의 노출 빈도를 바꾼다 — "세션은 하루를 안 넘긴다"는
  암묵 가정이 카운트다운 추가로 무효화됐다. [LEARNINGS.md](../../LEARNINGS.md) §1 참조.
