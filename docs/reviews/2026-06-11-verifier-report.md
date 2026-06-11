# Verifier 보고서 + Refiner 반영 결과

- **날짜**: 2026-06-11
- **평가자**: 독립 Verifier Sub-Agent (구현 컨텍스트 미공유, 적대적 리뷰 지시)
- **대상**: commits `cdf9b88` + `e00d382` / [루브릭](../rubrics/2026-06-11-completeness-upgrade-rubric.md)
- **최종 상태**: ✅ 모든 P1/P2 반영 완료 (commit `dd98ea9`), 전 테스트 통과

## 1차 평가 요약 (Refiner 반영 전)

| # | 기준 | 판정 | 점수 | 핵심 소견 |
|---|---|---|---|---|
| 1 | 일시정지 상태머신 | 통과 | 9/10 | `pausedFrom`이 G 전역에 잔존 (무해) |
| 2 | QUIT 무기록 | 통과 | 9/10 | RESTART 경로 무기록 테스트 부재 |
| 3 | 브레이크다운 무결성 | 통과 | 9/10 | E2E 합산이 0=0으로 **자명 통과** |
| 4 | 입력 누수 에지 | 통과 | 8/10 | **`G.start()` 키 미리셋** — 메뉴 blur stuck 키가 새 런 조종 |
| 5 | UTC·streak | 통과 | 7/10 | **자정 롤오버 통합 버그** (하단 P1) |
| 6 | 핫패스 무회귀 | 통과 | 9/10 | `$('btn-pause')` 프레임당 조회 |
| 7 | 타이머 누수 | 통과 | 9/10 | — |
| 8 | 코어 패턴 | 통과 | 9/10 | Math.random 개수 핀은 무딘 가드 (의도된 tripwire) |
| 9 | innerHTML 안전성 | 통과 | 9/10 | `fmt(d.rec.score)` 숫자 가정 (손상 레코드 시 조용한 실패) |
| 10 | E2E 재현성 | 통과 | 8/10 | 비자명 케이스 미검증, 포트 고정, 경로 가드 약점 |
| 11 | 관심사 분리 | **실패** | 5/10 | **신규 인라인 `style=` 3건이 자체 규칙 위반**, 정적 테스트가 못 잡음 |
| 12 | 빌드 동기화 | 통과 | 9/10 | — |

**가중 합계: 23/27 (85.2%) · Critical 실패 없음**

### P1 — UTC 자정 롤오버 통합 버그 (가장 실질적인 결함)

`recs.today`는 부팅 시 1회 캐시인데 데일리 시드는 매번 fresh `SY.todayUTC()`. 새로 추가된
**카운트다운이 정확히 이 시나리오를 유도** — 자정까지 기다렸다 RETRY하면:
(a) 새 날짜 시드로 플레이하지만 (b) `saveDaily(recs.today, …)`가 **어제 키에 저장** →
오늘 기록 없음 → streak 단절, (c) 페이스 비교 대상도 어제의 베스트.

> 교훈: all-green 테스트 뒤에도 통합 레벨 버그는 존재한다. 기능 추가(카운트다운)가
> 기존 가정(세션은 하루를 넘기지 않는다)의 노출 빈도를 바꿨다.

## Refiner 반영 내역 (commit `dd98ea9`)

| 우선순위 | 소견 | 수정 |
|---|---|---|
| P1 | 자정 롤오버 | 기록을 **런의 시드 날짜**(`res.seedStr`)로 저장, `syncToday()`를 시작·종료·카운트다운 0초에 호출, 자정 도달 시 "NEW DAILY READY!" 표시 → [ADR-0004](../adr/0004-daily-records-filed-by-seed-date.md) |
| P2 | 인라인 style 3건 (#11 실패) | `css/style.css`로 이전 + 정적 테스트에 inline style 예산(≤6) 추가 |
| P2 | E2E 자명 통과 | 결정적 크리스털 주입으로 score=348 비자명 검증 (버킷 합 120+78+105+45 일치), pace 곡선 assert |
| P2 | `G.start()` 키 미리셋 | `resetKeys()` 추가 + 단위 테스트 |
| P2 | 테스트 미커밋 | `test/` 전체 커밋 |
| P3 | btn-pause 프레임당 조회 | `hudEls.pauseBtn` 캐시 |
| P3 | 숫자 가정 | `fmt(Number(d.rec.score) \|\| 0)` |
| P3 | E2E 서버 경로 가드 | `root + path.sep` 접두 검사 |
| P3 | dailyBest null 크래시 가능성 | over 화면 통계에 null 가드 (`'—'` 표시) |
| (자체) | 빌드 동기화 검사가 커밋 전 항상 실패 | `git diff` → temp 빌드 **해시 비교**로 교체 |

추가 회귀 가드: E2E에 **rollover 시나리오** 신설 (`SY.todayUTC` 오버라이드로 2099-01-01 시뮬레이션,
새 날짜 시드·새 키 저장·화면 라벨 4건 assert).

## 최종 테스트 결과

```
unit + static (node --test) : 31/31 PASS
e2e (headless Edge)         : 26/26 PASS (5 시나리오: howto/quit/pause/over/rollover)
standalone build sync       : PASS (fresh build 해시 일치)
suite exit: 0
```

실행: `powershell -NoProfile -ExecutionPolicy Bypass -File test\run-all.ps1`
